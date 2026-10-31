/* Portable Windows host for the offline time converter.
   The HTML page is appended to this exe. We serve it on 127.0.0.1 only
   and open Edge or Chrome in app mode. No install and no internet. */

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PORT 47231
#define MAGIC "TMCONV1\n"

static char *g_html;
static size_t g_html_len;
static SOCKET g_listen = INVALID_SOCKET;
static HANDLE g_ready;
static volatile LONG g_stop;

static void tell(const wchar_t *text) {
  MessageBoxW(NULL, text, L"Time converter", MB_OK | MB_ICONINFORMATION);
}

static int file_ok(const wchar_t *path) {
  DWORD attr = GetFileAttributesW(path);
  return attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

static int query_exe(HKEY root, const wchar_t *sub, wchar_t *out, DWORD out_chars) {
  HKEY key;
  if (RegOpenKeyExW(root, sub, 0, KEY_READ | KEY_WOW64_64KEY, &key) != ERROR_SUCCESS) {
    if (RegOpenKeyExW(root, sub, 0, KEY_READ, &key) != ERROR_SUCCESS) return 0;
  }
  DWORD bytes = out_chars * sizeof(wchar_t);
  DWORD type = 0;
  LONG rc = RegQueryValueExW(key, NULL, NULL, &type, (BYTE *)out, &bytes);
  RegCloseKey(key);
  if (rc != ERROR_SUCCESS || (type != REG_SZ && type != REG_EXPAND_SZ) || bytes < sizeof(wchar_t)) return 0;
  out[(bytes / sizeof(wchar_t)) - 1] = 0;
  if (type == REG_EXPAND_SZ) {
    wchar_t expanded[1024];
    if (ExpandEnvironmentStringsW(out, expanded, 1024) == 0) return 0;
    wcsncpy(out, expanded, out_chars - 1);
    out[out_chars - 1] = 0;
  }
  return file_ok(out);
}

static int find_browser(wchar_t *out, DWORD out_chars) {
  const wchar_t *names[] = {L"msedge.exe", L"chrome.exe"};
  for (int i = 0; i < 2; i++) {
    wchar_t sub[320];
    _snwprintf(sub, 320, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\%s", names[i]);
    sub[319] = 0;
    if (query_exe(HKEY_LOCAL_MACHINE, sub, out, out_chars)) return 1;
    if (query_exe(HKEY_CURRENT_USER, sub, out, out_chars)) return 1;
  }

  const wchar_t *candidates[] = {
      L"%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe",
      L"%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe",
      L"%LocalAppData%\\Microsoft\\Edge\\Application\\msedge.exe",
      L"%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe",
      L"%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe",
      L"%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe",
  };
  for (int i = 0; i < 6; i++) {
    wchar_t expanded[1024];
    if (ExpandEnvironmentStringsW(candidates[i], expanded, 1024) == 0) continue;
    if (!file_ok(expanded)) continue;
    wcsncpy(out, expanded, out_chars - 1);
    out[out_chars - 1] = 0;
    return 1;
  }
  return 0;
}

static int load_payload(void) {
  wchar_t self[1024];
  DWORD n = GetModuleFileNameW(NULL, self, 1024);
  if (n == 0 || n >= 1023) return 0;

  HANDLE file = CreateFileW(self, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (file == INVALID_HANDLE_VALUE) return 0;

  LARGE_INTEGER size;
  if (!GetFileSizeEx(file, &size) || size.QuadPart < 16) {
    CloseHandle(file);
    return 0;
  }

  unsigned char tail[16];
  LARGE_INTEGER pos;
  pos.QuadPart = size.QuadPart - 16;
  DWORD read = 0;
  if (!SetFilePointerEx(file, pos, NULL, FILE_BEGIN) || !ReadFile(file, tail, 16, &read, NULL) || read != 16) {
    CloseHandle(file);
    return 0;
  }
  if (memcmp(tail + 8, MAGIC, 8) != 0) {
    CloseHandle(file);
    return 0;
  }

  uint64_t len = 0;
  memcpy(&len, tail, 8);
  if (len == 0 || len > 64ull * 1024ull * 1024ull || (long long)len > size.QuadPart - 16) {
    CloseHandle(file);
    return 0;
  }

  pos.QuadPart = size.QuadPart - 16 - (long long)len;
  char *html = (char *)malloc((size_t)len);
  if (!html) {
    CloseHandle(file);
    return 0;
  }
  size_t got = 0;
  SetFilePointerEx(file, pos, NULL, FILE_BEGIN);
  while (got < (size_t)len) {
    DWORD chunk = 0;
    DWORD want = (DWORD)(((size_t)len - got) > 1 << 20 ? 1 << 20 : ((size_t)len - got));
    if (!ReadFile(file, html + got, want, &chunk, NULL) || chunk == 0) {
      free(html);
      CloseHandle(file);
      return 0;
    }
    got += chunk;
  }
  CloseHandle(file);
  g_html = html;
  g_html_len = (size_t)len;
  return 1;
}

static int send_all(SOCKET sock, const char *data, size_t len) {
  size_t off = 0;
  while (off < len) {
    int want = (int)((len - off) > 1 << 20 ? 1 << 20 : (len - off));
    int wrote = send(sock, data + off, want, 0);
    if (wrote <= 0) return 0;
    off += (size_t)wrote;
  }
  return 1;
}

static void respond(SOCKET sock, const char *status, const char *type, const char *body, size_t body_len) {
  char head[256];
  int n = _snprintf(head, sizeof(head),
                    "HTTP/1.1 %s\r\n"
                    "Content-Type: %s\r\n"
                    "Content-Length: %zu\r\n"
                    "Cache-Control: no-store\r\n"
                    "Connection: close\r\n"
                    "\r\n",
                    status, type, body_len);
  if (n <= 0) return;
  if (!send_all(sock, head, (size_t)n)) return;
  if (body_len) send_all(sock, body, body_len);
}

static int is_app_get(const char *req) {
  return strncmp(req, "GET / HTTP/1.", 13) == 0 || strncmp(req, "GET /index.html HTTP/1.", 23) == 0;
}

static int host_is_local(const char *req) {
  const char *p = strstr(req, "\r\nHost:");
  if (!p) return 0;
  p += 7;
  while (*p == ' ') p++;
  return strncmp(p, "127.0.0.1:47231", 15) == 0 && (p[15] == '\r' || p[15] == '\n' || p[15] == '\0');
}

static DWORD WINAPI serve(void *unused) {
  (void)unused;
  SOCKET srv = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (srv == INVALID_SOCKET) {
    SetEvent(g_ready);
    return 1;
  }
  BOOL exclusive = TRUE;
  setsockopt(srv, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, (char *)&exclusive, sizeof(exclusive));

  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons(PORT);
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(srv, (struct sockaddr *)&addr, sizeof(addr)) != 0 || listen(srv, 8) != 0) {
    closesocket(srv);
    SetEvent(g_ready);
    return 1;
  }
  g_listen = srv;
  SetEvent(g_ready);

  for (;;) {
    SOCKET client = accept(srv, NULL, NULL);
    if (client == INVALID_SOCKET || g_stop) break;
    char buf[4096];
    int n = recv(client, buf, (int)sizeof(buf) - 1, 0);
    if (n > 0) {
      buf[n] = 0;
      if (!host_is_local(buf)) {
        respond(client, "403 Forbidden", "text/plain; charset=utf-8", "Forbidden", 9);
      } else if (is_app_get(buf)) {
        respond(client, "200 OK", "text/html; charset=utf-8", g_html, g_html_len);
      } else if (strncmp(buf, "GET /favicon.ico ", 17) == 0) {
        respond(client, "204 No Content", "text/plain", "", 0);
      } else {
        respond(client, "404 Not Found", "text/plain; charset=utf-8", "Not found", 9);
      }
    }
    closesocket(client);
  }
  return 0;
}

static void focus_existing(void) {
  HWND hwnd = FindWindowW(NULL, L"Time converter");
  if (!hwnd) return;
  if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
  HWND fg = GetForegroundWindow();
  DWORD fg_thread = GetWindowThreadProcessId(fg, NULL);
  DWORD me = GetCurrentThreadId();
  if (fg_thread != 0 && fg_thread != me) AttachThreadInput(me, fg_thread, TRUE);
  SetForegroundWindow(hwnd);
  if (fg_thread != 0 && fg_thread != me) AttachThreadInput(me, fg_thread, FALSE);
}

static int ensure_profile(wchar_t *profile, DWORD chars) {
  wchar_t base[MAX_PATH];
  if (FAILED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, base))) return 0;
  wchar_t root[MAX_PATH];
  _snwprintf(root, MAX_PATH, L"%s\\TimeConverter", base);
  root[MAX_PATH - 1] = 0;
  CreateDirectoryW(root, NULL);
  _snwprintf(profile, chars, L"%s\\profile", root);
  profile[chars - 1] = 0;
  CreateDirectoryW(profile, NULL);
  return 1;
}

int WINAPI WinMain(HINSTANCE instance, HINSTANCE prev, LPSTR cmdline, int show) {
  (void)instance;
  (void)prev;
  (void)cmdline;
  (void)show;

  HANDLE mutex = CreateMutexW(NULL, TRUE, L"Local\\TimeConverter.Portable.v1");
  if (mutex && GetLastError() == ERROR_ALREADY_EXISTS) {
    if (FindWindowW(NULL, L"Time converter")) focus_existing();
    else tell(L"Time converter is already open.");
    return 0;
  }

  if (!load_payload()) {
    tell(L"This copy of Time converter is incomplete. Copy the whole Time-converter.exe file and try again.");
    return 1;
  }

  WSADATA wsa;
  if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
    tell(L"Windows networking failed to start.");
    return 1;
  }

  g_ready = CreateEventW(NULL, TRUE, FALSE, NULL);
  HANDLE thread = CreateThread(NULL, 0, serve, NULL, 0, NULL);
  if (!g_ready || !thread || WaitForSingleObject(g_ready, 5000) != WAIT_OBJECT_0 || g_listen == INVALID_SOCKET) {
    tell(L"Time converter could not start because port 47231 is already in use. Close the other copy, then open this again.");
    focus_existing();
    return 1;
  }

  wchar_t browser[1024];
  wchar_t profile[MAX_PATH];
  if (!find_browser(browser, 1024) || !ensure_profile(profile, MAX_PATH)) {
    tell(L"Time converter needs Microsoft Edge or Google Chrome, which are already part of Windows 10 and 11. Neither was found. No internet download is required.");
    g_stop = 1;
    closesocket(g_listen);
    return 1;
  }

  wchar_t cmd[2048];
  _snwprintf(
      cmd, 2048,
      L"\"%s\" --app=http://127.0.0.1:%d/ --user-data-dir=\"%s\" --window-size=560,900 "
      L"--no-first-run --no-default-browser-check --disable-sync --disable-extensions "
      L"--disable-background-networking --disable-component-update --disable-translate",
      browser, PORT, profile);
  cmd[2047] = 0;

  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  memset(&si, 0, sizeof(si));
  memset(&pi, 0, sizeof(pi));
  si.cb = sizeof(si);
  if (!CreateProcessW(browser, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
    tell(L"Edge or Chrome was found but could not be opened.");
    g_stop = 1;
    closesocket(g_listen);
    return 1;
  }

  WaitForSingleObject(pi.hProcess, INFINITE);
  CloseHandle(pi.hProcess);
  CloseHandle(pi.hThread);

  g_stop = 1;
  closesocket(g_listen);
  WaitForSingleObject(thread, 2000);
  WSACleanup();
  return 0;
}
