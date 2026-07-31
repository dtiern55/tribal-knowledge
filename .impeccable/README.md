# Detector config

`ai-color-palette` is waived project-wide. It fires on the ocean-blue gradient
behind the My Points chip (`frontend/src/pages/MySeasonPage.tsx`, `HeaderPoints`),
reading blue/cyan gradients as the signature of generic AI-generated UI. Here
`ocean` is the deliberate Borneo-inspired brand palette defined in
`frontend/src/index.css` (#56), so the rule can't tell an intentional token from
a default.

Waived here rather than as an inline source comment because the detector is run
against captured DOM snapshots of the authenticated pages, not the `.tsx` files —
in-file `impeccable-disable` comments never reach it in that workflow.

The real contrast problem on that element (a `text-white/80` label dropping to
1.2:1 against the gradient's light end) was fixed in #289, not waived.
