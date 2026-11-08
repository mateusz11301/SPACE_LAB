<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep aerospace calculations in a browser-safe simulation module, separate from rendering, so deterministic flight rules can be tested.
- The simulator route is client-only; React Three Fiber reads continuous flight refs while the Polish DOM dashboard receives throttled snapshots.
- Use a spherical planet and SI units in simulation; render a floating-origin local scene to retain precision across orbital distances.
- Rocket hardware uses custom lathed engineering geometry with hinged controls because available CC0 assets do not expose the required gimbal, fin and leg assemblies.
- Keep synthesized audio lazy and gesture-initiated; never load external audio files.
