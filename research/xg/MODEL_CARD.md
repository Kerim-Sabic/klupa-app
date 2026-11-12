# Model card: Klupa shot-quality (xG) model

All numbers below were produced by `research/xg/train.py` and are stored in `research/out/xg_cv.json`.

## Intended use

A shot-quality index that weights shots in Klupa's momentum windows (stored as whole 1/10,000 units). Not a prediction of whether a child's shot will score.

## Do not use for

Ranking or scoring individual children, predicting injury, or presenting the output as a calibrated probability for youth football.

## Training data

Open Wyscout event data, seven competitions (see `research/data/DATA_CARD.md`), CC BY 4.0. Non-penalty shots only: 45,287 shots (43,078 open play, 2,209 direct free kicks), 4,629 goals (10.22%), 1,941 matches. Penalties (658) and own goals are excluded.

## Features and final model

Geometry on a 105 x 68 m pitch, attacked goal at x = 100: `dx = (100 - x) * 1.05`, `dy = (50 - y) * 0.68`.

| Feature    | Definition                                                   | Coefficient          |
| ---------- | ------------------------------------------------------------ | -------------------- |
| intercept  |                                                              | -1.0849403426995312  |
| distance   | metres to goal centre                                        | -0.10695821655786303 |
| angle      | `atan2(7.32 * dx, dx^2 + dy^2 - 3.66^2)`, clipped to [0, pi] | 1.597834632010153    |
| isHeader   | tag 403 head/body                                            | -0.9916027874845399  |
| isFreeKick | direct free kick                                             | 0.8981236880795306   |

Logistic regression, unpenalised (scikit-learn 1.9.1, `C = inf`), fitted on standardised inputs and mapped back to raw units. The score equations at the optimum are zero to 1.6e-8 per observation.

Terms tried (grouped 5-fold CV log loss, lower is better): base 0.28036; + distance*angle 0.28031; + distance^2 0.27953; + both 0.27928. Rule fixed before looking: adopt a term only if it lowers CV log loss by at least 0.0005 and the refitted model still has probability rising towards the goal along y = 50 over the whole pitch. Distance^2 gained 0.0008 but failed the second condition: its fitted positive coefficient makes the probability rise again beyond about 54 m from goal (probability 0.37 at the own goal line). Distance*angle gained under 0.0001. The base model is therefore the exported model.

## Evaluation

Pooled out-of-fold predictions. Baseline = the training folds' base rate. ECE uses 10 equal-count bins.

GroupKFold by match, 5 folds (shuffled, seed 20261111). Per-fold log loss: 0.2633, 0.2852, 0.2855, 0.2729, 0.2951.

|           | log loss | Brier   | ROC AUC | ECE     |
| --------- | -------- | ------- | ------- | ------- |
| model     | 0.28036  | 0.07978 | 0.7749  | 0.00550 |
| base rate | 0.32999  | 0.09178 | 0.4856  | 0.00535 |

Leave-one-competition-out (pooled over the seven held-out competitions):

|           | log loss | Brier   | ROC AUC | ECE     |
| --------- | -------- | ------- | ------- | ------- |
| model     | 0.28038  | 0.07978 | 0.7749  | 0.00537 |
| base rate | 0.32998  | 0.09178 | 0.4844  | 0.00538 |

By held-out competition (model log loss vs base rate; AUC):

| Competition           | shots | goals | model  | base   | AUC    |
| --------------------- | ----- | ----- | ------ | ------ | ------ |
| England               | 8,801 | 932   | 0.2879 | 0.3380 | 0.7753 |
| European Championship | 1,283 | 97    | 0.2354 | 0.2723 | 0.7709 |
| France                | 8,848 | 899   | 0.2819 | 0.3286 | 0.7657 |
| Germany               | 7,197 | 765   | 0.2896 | 0.3388 | 0.7703 |
| Italy                 | 9,221 | 889   | 0.2662 | 0.3174 | 0.7816 |
| Spain                 | 8,432 | 912   | 0.2899 | 0.3429 | 0.7791 |
| World Cup             | 1,505 | 135   | 0.2549 | 0.3028 | 0.7800 |

The ECE of a constant predictor is not informative: all its bins share one prediction, so the bins are formed in arbitrary data order and the value is sampling noise. Read ECE for the model against the reliability table, not against the baseline.

### Reliability (grouped CV, 10 equal-count bins)

| Bin | n     | mean predicted | observed rate |
| --- | ----- | -------------- | ------------- |
| 1   | 4,529 | 0.0142         | 0.0192        |
| 2   | 4,529 | 0.0247         | 0.0210        |
| 3   | 4,529 | 0.0349         | 0.0333        |
| 4   | 4,529 | 0.0477         | 0.0389        |
| 5   | 4,529 | 0.0627         | 0.0550        |
| 6   | 4,529 | 0.0791         | 0.0760        |
| 7   | 4,529 | 0.0989         | 0.0974        |
| 8   | 4,528 | 0.1263         | 0.1369        |
| 9   | 4,528 | 0.1720         | 0.1840        |
| 10  | 4,528 | 0.3615         | 0.3606        |

The model slightly over-predicts in bins 4 and 5 (by about 0.7-0.9 points) and under-predicts in bins 8 and 9 (about 1.1 points). No confidence intervals were computed for these bins.

Sanity checks asserted in `train.py`: shots 35,000-50,000 (45,287); goal rate 8-13% (10.22%); CV log loss below baseline and within 0.26-0.31 (0.2804); penalty-spot probability (x = 89.5, y = 50, foot, open play) between 0.15 and 0.45 (0.2245); probability rises towards the goal along y = 50 from x = 0 to 99.99.

## Limitations

- **Youth transfer.** Trained on men's professional shots. No published study tests transfer to youth football, and we did not test it either. Treat the output as a shot-quality index for youth teams, not a probability. The pitch, goal size, ball and goalkeeper heights differ in youth football.
- Only geometry, body part and free kick are used. No defender, keeper, assist type or game state. AUC 0.775 reflects that.
- Extrapolation: the model is not meaningful very close to the goal line or from the own half (few training shots there: 2.6% of shots start before x = 70). Its probability is 0.98 on the goal line itself (x = 100, y = 50), which no real shot supports.
- Calibration is checked only on out-of-fold data from the same seven competitions.
- Penalties are not modelled. The momentum study gives them a fixed weight of 7,600 units, which is an assumption, not an estimate from this model.

## Reproduce

```
python -m venv research/.venv
research/.venv/Scripts/python.exe -m pip install -r research/requirements.txt
# download the three files listed in research/data/MANIFEST.json into research/data/raw/
research/.venv/Scripts/python.exe research/xg/train.py
```

This rewrites `src/data/models/xg.json`, `research/out/xg_cv.json` and `research/out/xg_golden.json`. The TypeScript port is tested against the golden file by `src/engine/__tests__/xg.test.ts`.
