# MakeLifeEasy Clock

Version 1.0.0. A time converter.

It shows your local time, the zones you add, and a converter. Clocks is the first tab. Convert is the other tab. Daylight saving is handled, including the missing hour in spring and the repeated hour in autumn. AM is a sun. PM is a moon. The time you type never leaves the browser.

## Run it

You need [Node.js 22.12 or newer](https://nodejs.org/).

```bash
npm install
npm test
npm run dev
```

Open http://127.0.0.1:5173/

```bash
npm run build
npm run preview
```

## Windows

`portable/launcher.c` is the small program that opens this clock in its own window. It needs 64-bit Windows 10 or 11, and Edge or Chrome, which are already on the PC. It does not need the internet while it runs.

The built `Time-converter.exe` is not in this repository. When you publish a release, attach that exe on the GitHub release page.

## Other repos

- Website: [MakeLifeEasy-Website](https://github.com/S-Gopisetty/MakeLifeEasy-Website)
- Awake: [MakeLifeEasy-Awake](https://github.com/S-Gopisetty/MakeLifeEasy-Awake) is reserved and empty
