<!--
Stage presets. Each "## name" block lists key: value lines. Edit freely.

Keys
- view:    title | necklace | unrolled | homogeneous | period-map | profile | figure | none
- alpha, L1, L2:  coefficient parameters (defaults below)
- a:       threshold; a number, or aMinus / aPlus / half
- s:       sampling phase; a number, or rhoP / rhoQ / L1/2 / L1 / 0
- j:       number of spargels drawn (Sigma_0 .. Sigma_{j})
- layers:  comma-separated layer names (see README); each layer shows its status tag
- panel:   b | profile | none   (side panel)
- zoom:    P | Q | contact        (inset)
- zoomonly: yes  (draw only the zoom panels, large)
- select:  index of a base crossing to select (1-based, in order from Q0 to P0)
- cut:     slot cut c for crossing words (Def. 5.2); default 0, as in Figure 4(c)
- box:     u_min, u_max, v_min, v_max of the phase plane
- figure:  file name in build/fig (static figure for view: figure)
- controls: comma-separated live controls shown (a, s, j, rho)
-->

## defaults
alpha: 0.25
L1: 0.4
L2: 0.8
box: -0.05, 1.05, -0.75, 0.15

## title
view: title

## none
view: none

## necklace
view: necklace

## unrolled
view: unrolled

## H1
view: homogeneous
a: 0.45
layers: separatrices, threshold, gap
controls: a
box: -0.05, 1.05, -0.75, 0.15

## H2
view: homogeneous
a: 0.5
layers: separatrices, threshold, gap, front-orbit
controls: a
box: -0.05, 1.05, -0.75, 0.15

## F1
view: period-map
a: half
s: L1/2
layers: equilibria, threshold, trajectory-uP
box: -0.05, 1.05, -0.75, 0.15

## F2
view: period-map
a: half
s: L1/2
layers: equilibria, threshold, trajectory-uP-faint, samples-uP
box: -0.05, 1.05, -0.75, 0.15

## F3
view: period-map
a: half
s: L1/2
j: 2
layers: equilibria, threshold, samples-uP, straight-parts, spargels-faint, mirror-faint
box: -0.05, 1.05, -0.75, 0.15

## S1
view: period-map
a: 0.47
s: 0.1
layers: equilibria, threshold, eigenlines, straight-parts, gap, b-point
panel: b
controls: s, a
box: -0.05, 1.05, -1.0, 0.15

## S2
view: period-map
a: 0.47
s: 0.1
layers: equilibria, threshold, eigenlines, straight-parts, gap, b-point
panel: b
controls: s, a
box: -0.05, 1.05, -1.0, 0.15

## S3
view: period-map
a: 0.47
s: rhoP
layers: equilibria, threshold, eigenlines, straight-parts, gap, b-point, roots
panel: b
controls: s, a
box: -0.05, 1.05, -1.0, 0.15

## S4
view: period-map
a: aPlus
s: 0
layers: equilibria, threshold, eigenlines, straight-parts, b-point
panel: b
zoom: contact
box: -0.05, 1.05, -1.0, 0.15

## T1
view: profile
a: half
layers: uP, B-minus, B-plus
panel: b
controls: rho

## T2
view: period-map
a: half
s: rhoP
zoom: P, Q
zoomonly: yes

## E1
view: period-map
a: half
s: 0.3
layers: equilibria, threshold, straight-parts, escape-return, escape-trajectory
panel: b
controls: s, a
box: -0.6, 1.05, -1.0, 0.6

## E2
view: period-map
a: 0.42
s: 0.3
layers: equilibria, threshold, straight-parts, escape-return, escape-trajectory
panel: b
controls: s, a
box: -0.6, 1.05, -1.0, 0.6

## G1
view: period-map
a: half
s: rhoP
j: 0
layers: equilibria, threshold, straight-parts, I, E, spargels, pocket, base
box: -0.05, 1.05, -0.75, 0.15

## G2
view: period-map
a: half
s: rhoP
j: 5
layers: equilibria, threshold, straight-parts, I, E, spargels, pocket, base
controls: j
box: -0.05, 1.05, -0.75, 0.8

## G3
view: period-map
a: half
s: rhoP
j: 5
layers: equilibria, threshold, straight-parts, E, spargels, pocket, base, arcs-C
controls: j
box: -0.05, 1.05, -0.75, 0.8

## G4
view: period-map
a: half
s: rhoP
j: 5
layers: equilibria, threshold, E, spargels, pocket, base, base-crossings
panel: profile
select: 4
controls: j
box: 0.3, 0.55, -0.72, -0.4

## M1
view: period-map
a: half
s: L1/2
j: 2
layers: equilibria, threshold, spargel-j, mirror-j, mirror-intersections
box: 0.46, 0.54, 0.535, 0.585

## M2
view: period-map
a: aMinus
s: L1
layers: equilibria, threshold, straight-parts, I, images-I, pocket-endpoint, endpoint-markers
box: -0.05, 1.05, -1.0, 0.8

## M3
view: period-map
a: aPlus
s: 0
layers: equilibria, threshold, straight-parts, I, images-I, endpoint-markers
box: -0.05, 1.05, -1.0, 0.8

<!-- Round 3 presets. "builds: n" adds n reveal steps (→); "buildK: key=value; ..." sets values from build K on. -->

## X1
view: images

## J1
view: junction3d
a: 0.42
controls: a
exportframe: 0.45

## B1
view: cubic
a: 0.3
controls: a

## B2
view: cubic-portrait
a: 0.45
controls: a

## Hop
view: geo-cubic
alpha: 0.25
L1: 2
L2: 4
a: 0.48
amin: 0.40
amax: 0.60
s: 1
mode: hop
controls: a

## RetMap
view: geo-cubic
alpha: 0.25
L1: 2
L2: 4
a: 0.48
amin: 0.46
amax: 0.54
s: 1
mode: orbits
controls: a, s

## Mfd
view: geo-cubic
alpha: 0.25
L1: 2
L2: 4
a: 0.48
amin: 0.46
amax: 0.54
s: 1
mode: manifolds
controls: a, s

## K1
view: geo-mckean
mode: straight
a: 0.47
s: 0.1
amin: 0.3
amax: 0.7
controls: a

## K2
view: geo-mckean
mode: matching
a: 0.47
s: 0.1
controls: a, s

## K3
view: interval
s: 0.1
controls: s

## K4
view: lengths

## K5
view: geo-orientation
a: 0.47
s: 0.1
j: 2
controls: a, s, j
builds: 1

## V1
view: prescribed
a: 0.47
s: 0.05
controls: s, a
wrap: no

## V2
view: builder4
L1: 0.8
L2: 1.6
a: 0.56
slots: 0, 2, 4
word: QPP
controls: rho3, a
builds: 1

## V3
view: only-way
a: 0.5
j: 5

## Spargels
view: period-map
a: 0.47
s: rhoP
j: 5
clampa: 0.004
plain: yes
layers: threshold, straight-parts, E, spargels, arcs-C, pocket, base, equilibria
box: -0.05, 1.05, -0.75, 0.8
controls: a, j
builds: 1
build1: box=pocket; layers=threshold, E, spargels, pocket, base, base-crossings; wordlabels=yes; panel=profile; select=1

## A1
view: necklace3d
a: 0.47
j: 5
labels: legend

## NeckFront
view: necklace3d
a: 0.47
j: 5

## Reduction
view: reduction

## Stab
view: stability
a: 0.47
builds: 2
controls: rhopm, sigma
