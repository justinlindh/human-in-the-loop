<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/logo-dark-theme.png">
    <img src="docs/readme/logo.png" alt="Human in the Loop: an AI-era company sim" width="520">
  </picture>
</p>

<p align="center">
  <a href="https://justinlindh.github.io/human-in-the-loop/"><b>Play in your browser</b></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/justinlindh/human-in-the-loop/releases/latest"><img src="https://img.shields.io/github/v/release/justinlindh/human-in-the-loop?include_prereleases&amp;label=build" alt="Latest build"></a>
</p>

> [!WARNING]
> **Pre-alpha.** This is an experimental side project, not a product. It is incomplete, unbalanced and full of placeholder content. It may change completely, stall, or be abandoned at any point. Builds are tagged automatically, but none of them is stable: there is no roadmap and no support, and saves can break between builds.

**Human in the Loop** is a management sim about running a software company through the AI era, in the spirit of Kairosoft's Game Dev Story. You hire people, ship products, survive outages and launch parties, and decide how much of the work the machines should do. You are the human in the loop.

A run is a 20-year career, from a garage in 2019 through the AI boom and whatever comes after it. The office is a small isometric 3D diorama that grows with the company; everyone in it has a desk, a mood and opinions in the company chat.

<p align="center">
  <img src="docs/readme/office-loop.gif" alt="A busy office in motion" width="800">
</p>

| | |
|---|---|
| ![Two founders at their first desks in a garage](docs/readme/garage.png) | ![The office empty during lockdown, with everyone on a video call](docs/readme/lockdown.png) |
| ![A busy headquarters with bookcases, plant walls and an office cat](docs/readme/hq.png) | ![The Waffle Party: the incentive winner at a spotlit waffle table while the team watches](docs/readme/waffle.png) |

## Running it

The latest tagged build is playable at https://justinlindh.github.io/human-in-the-loop/. Each release deploys there automatically.

To run it locally you need Node.js 22 or newer, with npm.

```sh
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173). Add `?seed=N` for a reproducible game.

`npm test` runs the simulation and balance tests.

## License

Copyright (c) 2026 Justin Lindh. All rights reserved.

The source is public so people can read it. No license is granted to use, copy, modify or distribute it; see [LICENSE](LICENSE). Contributions are not being accepted right now.
- skip test
