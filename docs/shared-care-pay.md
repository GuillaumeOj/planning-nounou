# Shared care, hours, and the monthly declaration

Design notes for the *garde partagée* pay model: how hours are typed, how they are
split between families, and how a month is declared to pajemploi.

This document exists because the reasoning is expensive to reconstruct and almost
none of it is derivable from the code. The regulatory quotes are the load-bearing
part — if you change a threshold, change it here first.

**Scope: `garde d'enfants à domicile` only.** The `assistant maternel` case
(childminder at their own home) has a *different* set of rules — 45h conventional
week, `heures complémentaires`, a freely-negotiated majoration with a 10% floor —
and is deliberately not modelled. Do not generalise the constants below to it.

## 1. The regulatory ground truth

Source: URSSAF, [Le contrat de travail d'un salarié à domicile][urssaf-contrat],
section *"Les différents types d'heures"* → tab *"Garde d'enfants à domicile"*.
Convention collective: **IDCC 3239** (particuliers employeurs et emploi à domicile).

> **Heures normales :** elles correspondent aux heures habituelles de garde de
> l'enfant. La durée hebdomadaire conventionnelle de travail est fixée à
> **40 heures par semaine**.

> **Heures supplémentaires :** elles correspondent aux heures effectuées au-delà
> de 40 heures par semaine, dans la limite de la durée maximale de travail. Elles
> donnent lieu à une majoration de **25 % (pour les 8 premières heures)** et
> **50 % (pour les heures supplémentaires au-delà de 8 heures)**.

> **Heures de présence de nuit :** elles correspondent aux heures effectuées entre
> **20 heures et 6 heures 30**, et sont rémunérées par une **indemnité forfaitaire**
> dont le montant ne peut être inférieur à **un quart du salaire contractuel** versé
> pour une durée de travail effectif équivalente. Cette présence ne peut pas excéder
> 12 heures consécutives […]

> **Heures de présence responsable :** elles correspondent aux heures où la garde
> d'enfants peut utiliser son temps pour elle-même tout en restant vigilante pour
> intervenir s'il y a lieu. Une heure de présence responsable équivaut à
> **deux tiers d'une heure de travail effectif**.

So the weekly bands are:

| Weekly effective hours | Rate |
| --- | --- |
| 0 – 40 | normal |
| 41 – 48 (first 8 over) | +25% |
| 49+ | +50% |

A **secondary source claimed the bands were the 36th–43rd hour**. That is wrong for
IDCC 3239 — it is the generic 35h Code du travail rule leaking in. The 40h figure is
confirmed both by the URSSAF page quoted above and by the
[Code du travail numérique][cdtn-hs] (which also lists 45h — that is the
`assistant maternel` case, not ours).

> [!NOTE]
> `urssaf.fr` refuses our fetcher (the connection hangs), but plain `curl` with a
> browser User-Agent retrieves it fine. Use `curl` if you need to re-check these
> quotes.

### Not every "extra hour" is an overtime hour

This is the trap. Three different things a parent would casually call "extra hours"
are paid by three different mechanisms:

| Kind | Mechanism |
| --- | --- |
| Extra effective work (early morning, late afternoon) | Adds to the weekly total → may cross into +25% / +50% |
| **Présence de nuit** (20:00–06:30) | An **indemnity**, priced **by the hour** at a fraction of the equivalent salary. Does not count toward the 40h week. |
| **Présence responsable** | Counts as **⅔** of an effective hour — **but forbidden in garde partagée**, see below |

Hence an exceptional-hours entry carries a **type**, never just a duration.

> [!CAUTION]
> **Présence responsable does not exist in a garde partagée.** [Art. 137.1][ccn-137-1],
> first line: « **Les heures de présence responsable de jour sont exclues dans le cadre
> de la garde partagée.** »
>
> URSSAF's page lists it under "garde d'enfants à domicile" without this caveat, because
> that page describes the *job*; the exclusion is a *garde partagée* rule and lives in
> the convention. Both are true of different situations — so the rule is a **gate on
> shared contracts, not a deletion**: a solo contract may use it. Every hour booked
> through it on a shared contract pays ⅔ of what is owed.
>
> Where it *is* allowed, note two things art. 137.1 also says: conversion happens
> **before** the weekly count (« prises en compte **après leur conversion** »), and it
> « ne se présume pas » — it must be written into the contract.

**Présence de nuit is priced by the hour, and "forfaitaire" does not mean "flat".**
[Art. 137.2][ccn-137-2] settles it by repetition — *every* tier is a fraction « du
salaire contractuel versé pour une durée de travail effectif **équivalente** », i.e. of
what those same hours of real work would have paid:

| That night | Indemnity |
| --- | --- |
| Undisturbed | **≥ ¼** of the equivalent salary |
| Woken **≥ 2** times | « est **portée à** » **⅓** — an obligation, not a floor |
| Woken **≥ 4** times | The interventions themselves at the **full** rate; the rest of the night at ⅓ |
| **Every** night ≥ 4 | Requalified as effective work outright; « le contrat de travail doit être revu » |

So a longer night costs more, and a contract quoting « ……… € brut par nuit » is
expressing the same rule for its own expected duration, not a different one. An agreed
rate below what the article requires is lifted to it — a clause under a conventional
minimum is void and replaced by the minimum — and warned about. An unset rate therefore
pays the ¼ floor rather than nothing.

The last two rows are **not computed**: they need each intervention's duration, which
nothing records. They warn instead of producing a wrong number.

Présence de nuit also requires the nanny to **sleep on site** in a separate room
(art. 137.2), so a 20:00–23:00 babysit is *travail effectif* — the more expensive kind,
and the one that counts toward the 40h week. The window itself may be shifted by up to
1h30 in total by agreement, which the contract records and this codebase does not.

### Mensualisation

Regular care must be mensualised: the monthly salary is a fixed amount that does not
follow the calendar month's actual day count.

```
monthly_hours = weekly_hours × 52 ÷ 12
```

[Art. 146.1][ccn-146-1], verbatim: « salaire horaire brut x nombre d'heures de travail
hebdomadaire x **52 semaines** / 12 mois. » 52 = 47 worked weeks + 5 of paid leave.

> [!CAUTION]
> **52 is not a variable, and there is no *année incomplète* here.** An earlier version
> of this document said "an année incomplète uses its own count" and a `weeks_per_year`
> field was built on it. That is the **assistant maternel** rule — precisely the
> generalisation the Scope note above forbids, made by the same document that forbids it.
>
> For a garde d'enfants à domicile the split is **régulière vs irrégulière**, not
> complète vs incomplète:
> * **régulière** → [art. 146.1][ccn-146-1], mensualised, **always × 52**.
> * **irrégulière** → [art. 146.2][ccn-146-2]: « le salaire est calculé […] en fonction
>   du nombre d'heures de travail effectif décomptées dans le mois » — **au réel, no
>   mensualisation at all**.
>
> Pajemploi's own form says the same thing from the other end: *"Si la garde est
> mensualisée : nombre d'heures mensualisées. Si la garde est occasionnelle : nombre
> d'heures réellement effectuées."* Two modes, not a spectrum.

Contractual overtime is mensualised the same way and keeps its band. A 45h/week
contract is *structurally* 40h normal + 5h at 25%, every week:

```
normal = 40 × 52 ÷ 12 = 173.33 h
at 25% =  5 × 52 ÷ 12 =  21.67 h
```

Which is why the planning can pre-fill the declaration: the schedule yields the
*structural* split, and only genuinely exceptional hours are typed by hand.

## 2. Splitting hours between families

### The constraint

pajemploi has **no way to split an hourly rate between two employers**. Each family
files its own declaration. So the split has to happen in the **hours**, not the rate:
each family declares the share of hours attributable to it, all at the same rate.

The invariant that must always hold:

> The hours declared by all families **sum to the hours the nanny actually worked**.
> Never more (the nanny is paid twice), never less (the nanny is underpaid).

### Why a per-family percentage does not work

The obvious model — one `share` percentage per family on the contract — dies on two
real cases:

1. **A family is absent on one weekday.** Wednesday is 0/100 while every other day is
   50/50. One percentage cannot be both.
2. **A child attends only part of the day.** Family A has kid1 all day and kid2 only
   after school (16:30–18:00); family B has one kid all day. Then 08:00–16:30 is
   50/50 but 16:30–18:00 is ⅔/⅓. **A family's weight is a function of the time of
   day**, not a property of the family.

Case 2 is the one that settles it. A static weight is wrong for part of every day.

### The model

Store **which children are present when**; *derive* the weight per time segment.

- **`Contract.split_method`** — `EQUAL` | `BY_CHILDREN`, agreed when the contract
  is signed. This is a genuine choice by the families, not something derivable:
  two families can have 2 and 1 children and still agree to split 50/50.
- **`ContractChild(contract, child)`** — which children this contract covers.
  (No `Contract`↔`Child` link existed before; `Child` only knew its `Family`.)
- **`ContractChildWindow(contract_child, weekday, start_time, end_time)`** —
  *optional*. **No window at all means the child is present whenever the nanny
  works**, which is the common case and therefore the default. Windows narrow a
  child to part of a day. If a child has any window, its presence is exactly the
  union of its windows.

> [!IMPORTANT]
> "Has any window" is evaluated **per child, across all weekdays** — never per weekday.
> The per-weekday reading (`windows.filter(weekday=d)` inside the loop) looks identical
> and inverts the Wednesday case: a child with windows on Mon/Tue/Thu/Fri has none on
> Wednesday, so the per-weekday reading concludes "no windows → present all day" — the
> exact opposite of what those windows were written to say. The two readings differ
> *only* on this case, which is the one the table below relies on.

Then, for each schedule block, a pure function cuts the block at every instant where
the set of present children changes, and each resulting segment is split on its own:

```
weight(family, segment) = 1  if the family has >= 1 child present in the segment, else 0
                                                          # split_method == EQUAL
                        = number of that family's children present in the segment
                                                          # split_method == BY_CHILDREN

share(family, segment)  = weight(family, segment) ÷ Σ weights over families in segment
```

> [!IMPORTANT]
> Under `EQUAL` the weight is **1 per family with a child present**, *not* 1 per family
> on the contract. The second reading is the natural one and it is wrong: it hands
> family B a half share of a Wednesday its child never attended, contradicting the case
> table below. Presence gates the weight under **both** methods; the method only decides
> whether a present family counts once or once per child.

**If no child is present in a segment** (every child windowed out of an early-morning
hour, say), the weights all collapse to zero. Do not drop the segment — that breaks the
sum invariant and underpays the nanny. **Fall back to an equal split across every family
on the contract, and warn.** This is not a defensive branch: a contract with no
`ContractChild` rows at all hits it for *every* segment, which is exactly how the
feature stays additive for contracts that predate it (equal split when shared, 100% when
solo — the status quo).

### Worked example

Monday 08:00–18:00. Family A: kid1 (all day) + kid2 (16:30–18:00 window).
Family B: kid1 (all day). `split_method = BY_CHILDREN`.

| Segment | Children present | Weights A / B | Hours | → A | → B |
| --- | --- | --- | --- | --- | --- |
| 08:00–16:30 | A1, B1 | 1 / 1 | 8.5 | 4.25 | 4.25 |
| 16:30–18:00 | A1, A2, B1 | 2 / 1 | 1.5 | 1.00 | 0.50 |
| | | | **10.0** | **5.25** | **4.75** |

5.25 + 4.75 = 10.0 — the invariant holds.

### Every known case against the model

| Case | Expressed as | Result |
| --- | --- | --- |
| Both families 1 kid, equal care | no windows, either method | 50/50 |
| B does not employ on Wednesday | B's kid: windows on Mon/Tue/Thu/Fri only | Wed → A 100% |
| A has 2 kids, B has 1, proportional | no windows, `BY_CHILDREN` | ⅔ / ⅓ |
| …same, but families agreed equal | no windows, `EQUAL` | 50/50 |
| A's kid2 attends after school only | kid2: a 16:30–18:00 window | 50/50, then ⅔ / ⅓ |

Known rough edge: **excluding a single weekday means listing windows for the other
four**, because "no windows" already means "always present". The UI should offer an
"apply to all days except…" affordance rather than making anyone type four windows.

### The split is contractual, not geographic

The governing text is [art. 144.2][ccn-144-2]:

> En cas de garde partagée, chaque particulier employeur rémunère **les heures de travail
> du salarié** selon **la répartition prévue aux termes des contrats de travail** et des
> éventuels avenants conclus par chacun des particuliers employeurs avec le salarié.

Read the object: « **les heures de travail du salarié** » — a *single pool*, the nanny's
own working time — divided by a *répartition* the contracts define. Location is not
mentioned. **This model is not a workaround; it is the mechanism the convention
describes**, and this app is the tool for expressing that répartition.

An earlier version of this document worried that URSSAF frames garde partagée as
location-based, quoting *"Chaque famille rémunère les heures effectuées à son domicile"*.
That sentence is from a plain-language **summary of the job**, and its own tail defers to
the contract — *"selon les modalités définies au contrat de travail"*. It describes the
common alternating-homes case; it does not prescribe it. Where the summary and the
convention differ, the convention governs.

So: **care happening more often at one family's home does not oblige them to pay more.**
The families agree a répartition and write it down.

> [!IMPORTANT]
> **Both contracts must record the *shared* schedule**, not each family's slice.
> Art. 144.2 divides « les heures de travail du salarié » — so the contracts have to say
> what those hours are. If each contract states only that family's 22.5h, then the
> répartition has nothing to divide and declaring overtime contradicts the contract's own
> weekly duration. This is also the condition on which "band before split" rests.

## 3. The monthly declaration

What each family ultimately needs to type into pajemploi, **in the form's own order**:

- overtime hours at 25%
- overtime hours at 50%
- normal (working) hours
- **net salary** = `normal × rate + h25 × rate × 1.25 + h50 × rate × 1.50`
- **total amount** = net salary + the night indemnity + any worked-holiday majoration
- each advantage, its own field: transport, kilometric, in-kind

Two figures, not one, because the pajemploi form has both. The **advantages are not
folded into the total** — they are separate lines on the form — so `total_amount` stops
at the net wage due. For an ordinary month with no night or holiday work the two are
equal, which is the common case.

> [!IMPORTANT]
> **The declared hours are rounded UP to whole hours, per family.** A family's exact
> mensualised 173.33 h is declared as 174. This deliberately drops the "families sum to
> exactly the nanny's hours" invariant that `apportion` keeps elsewhere: each family
> ceils on its own, so the parts sum to a hair *more* than she worked — the safe
> direction, and a product decision, not an arithmetic one. The **salary is then priced
> from the declared (ceiled) hours**, so what we show and what pajemploi recomputes from
> the numbers the parent types agree. `ceil_hours()` is the one edit if this is revisited.

Assembled as:

1. **Base** — the nanny's weekly hours **banded first** (§1), *then* each band split
   per family (§2), then mensualised.
2. **Minus unpaid absences** — prorated by the « heures réelles » formula the convention
   prescribes ([art. 152.1][ccn-152-1]), *not* by subtracting raw hours:

   > salaire mensualisé × **nombre d'heures réellement effectuées dans le mois** ÷ nombre
   > d'heures qui auraient dû être réellement travaillées dans le mois considéré si le
   > salarié n'avait pas été absent

   An earlier version subtracted the hours scheduled that weekday straight off the base.
   That is not the prescribed method and it breaks in short months: February has 20
   working days against a base built on an average of 21.7, so a nanny absent *every day
   of February* still had 13.33 h declared for her. The ratio cannot do that — absent all
   month, the numerator is zero. Both operands are already in `compute_month`.

   Related, [art. 142][ccn-152-1]: an absence **not provided for in the contract** does
   not suspend the relationship and « la rémunération du salarié est maintenue ». A family
   cannot unilaterally decide its own holiday is unpaid.
3. **Plus exceptional hours** — typed per §1, attributed per §3.1 below.
4. **Advantages** — `transport_fee` and `benefits_in_kind` are one monthly figure for
   one nanny, so they are split so that the nanny receives the agreed total, not a
   multiple of it. The split weight is each family's share of the **contractual base** —
   the mensualised schedule, taken *before* absence proration and *before* the
   exceptional top-up (`base_weights()`) — **not** its share of the month's actual hours.
   That is deliberate: a fixed monthly advantage should be the same every ordinary month,
   and weighting it by the month's total hours made an exceptional evening quietly enlarge
   a family's share of the transport fee, which is confusing and wrong. `mileage_rate ×
   kilometers` uses the km entered on the declaration.
5. **Paid leave** taken is reported two ways, without choosing between them: quota −
   taken, and accrued (2.5 days per month worked) − taken.

### Band before split — never the reverse

This is the largest money decision in the feature. Splitting first and banding each
family's slice **destroys the majoration**: a 45h week split 30/15 leaves both families
under 40h, so nobody declares overtime and the nanny silently loses it. Band the
nanny's *total* week (she really did work 45h), then split each band.

The counter-argument is real and was weighed: at pajemploi each family files separately,
never sees the other's hours, and URSSAF's framing is per-home (§2). It was rejected —
the 40h threshold protects the nanny, and an arrangement between employers should not
dissolve it. Keep this in a single `band_week()` function so the ruling is one edit.

### 3.1 Exceptional hours do **not** use the windows

Windows describe the *regular* week. An exceptional entry is by definition irregular, so
reading presence from the windows is not just imprecise — it is backwards. If child A's
window is 16:30–18:00 and family A files an exceptional 19:00–21:00, the window says A's
child is absent, weight 0, and **family A's own extra hours are billed to family B**.

Rule: for exceptional hours, presence is **whoever filed the entry**, never the windows.
Union each family's own overlapping entries before attributing (A filing 19–21 *and*
20–22 by mistake means 3h, not 5h).

**Solo vs shared, and why a declaration must not depend on the other family.** An earlier
version reconciled overlapping entries between families automatically: if A and B both
filed 19:00–21:00, the overlap split by the usual weight. That is dangerous — it makes
A's declared hours a function of whether B happened to file, so a family that forgets its
entry silently changes the other's number. A declaration each family files separately at
pajemploi must be reproducible from that family's own data alone.

So `is_shared` is now an explicit flag on the entry, and attribution reads nobody else's
rows (`attribute_exceptional`):

- a **solo** entry (the default) is *wholly its filer's*. A family's own extra hour is
  paid in full — a family that keeps the nanny late for its own child pays the whole hour,
  and nothing the other family does can move that number.
- a **shared** entry is care both families needed at once, and its filer takes only its
  own contractual share of it (`contract_shares`, the same `EQUAL`/`BY_CHILDREN` weight
  the schedule uses, asked as "everyone is here"). Both families are expected to file
  their own — the UI shows the second family a *"the other family logged shared care, add
  yours"* prompt, and answering it files an identical shared entry — and then the shares
  sum to the whole. If one forgets, the nanny is short **exactly that family's share** and
  no other declaration is wrong: the failure is local and visible, not a silent shift.

Two *different* families each filing **solo** for the same clock time each pay the full
hour — the nanny cannot be in two places at once, so that is almost always shared care
they should have marked shared. Rather than reconcile it away in silence (and reintroduce
the dependency), `compute_month` raises `overlapping_solo_exceptional` so they fix it.

Exceptional hours must fall **outside** the schedule; an entry overlapping a scheduled
block would be paid twice, once inside the mensualised base and once as an add-on. A
child present outside their *window* but inside the *schedule* is a different thing
entirely (the nanny works no longer; only the split moves) and is modelled separately.

### Snapshotting

The declaration **snapshots its rate periods** alongside the declared hours: a
declaration records what was *filed*, so it must not drift when the terms change later.

**Plural, deliberately.** A month can span several `ContractTerms` (a mid-month raise),
and then `total ≠ hours × rate` for any single rate — the parent cannot reproduce the
figure from what they see. So store the per-period detail, plus flat scalars for the
terms in force on the month's **last day** (what the UI shows; almost every month has
exactly one), plus a warning that the rate moved. Sub-periods are weighted by
`days_in_sub_period ÷ days_in_month`, which sums to exactly 1 — so **a mid-month avenant
changes the price, never the total hours**.

### 3.2 One thing that looks like a bug and is not

**Paid leave deducts nothing.** 52 weeks = 47 worked + 5 of paid leave. The leave is
already inside the mensualised base. "She was off all week and got paid the same" is
mensualisation working exactly as intended. Confirmed for this exact population by
[URSSAF][urssaf-cp]:

> **Rémunération mensualisée sur 52 semaines (assistants maternels agréés et gardes
> d'enfants à domicile)** — Les congés sont rémunérés lorsqu'ils sont pris. Le salaire
> mensualisé est versé tous les mois, y compris pendant les périodes de congés payés.

**Unpaid, sickness and maternity absences all deduct**, via the same art. 152.1 ratio (§3,
step 2), and the reduction is shared across the families by the presence each would have had
that day — a shared Monday off comes off both, a Monday only one family used comes off only
that one. All three are the same to the declaration: in each the hours are simply not worked
and the employer does not pay them. Sickness and maternity add nothing beyond that here — the
nanny's IJSS, and any *maintien de salaire* the CCN's seniority conditions might owe, are
separate indemnities paid outside the declared hours and are not modelled, exactly like the
night and holiday indemnities are kept apart from the bands.

> [!IMPORTANT]
> **A deducted month is flagged, on purpose.** A declaration whose hours sit below the
> contractual base reads as a bug to a parent who does not know an absence caused it. So
> `compute_month` raises `hours_reduced_for_absence` whenever any family's attendance ratio
> falls below 1 — which happens for unpaid, sickness and maternity leave and nothing else
> (paid leave and a day she never works both leave the ratio at 1) — and the UI shows it in the amber
> warning box beside the figures. The signal is the whole point: the lower number is
> correct, and saying why is what keeps it from looking wrong.

### 3.3 An *unchômé* bank holiday is paid extra, and we owe it

An earlier version of this document asserted, in bold and pre-defended against future
correction, that "bank holidays must not touch the base". **That was half wrong, and the
half that was wrong is the expensive half.** It is recorded here rather than quietly
deleted, because a confidently-worded error is harder to remove than a plain one and
this document's tone is what protected it.

**Chômé — correct, nothing to deduct.** Mensualisation smooths it: a fixed `× 52 ÷ 12`
exists so the calendar month does not matter. May has more jours fériés than March and
the salary is identical. `BankHoliday`'s docstring describes a *planning* fact — the
grid hides working blocks on a non-workable holiday — and reusing it for *pay* would
deduct them twice. Note the entitlement is conditional ([art. 47.2][ccn-47-2]): it
requires the nanny to have worked the last working day before and the first after.

**Travaillé — we pay a majoration, and currently do not.**

> [!WARNING]
> [Art. 47.2][ccn-47-2]: « En contrepartie du travail un jour férié ordinaire, le
> salarié perçoit, au titre des heures effectuées, une rémunération majorée à hauteur de
> **dix pour cent (10 %)** du salaire dû. »
>
> [Art. 47.1][ccn-47-1]: « [Lorsque le] 1er mai est un jour travaillé par le salarié. En
> contrepartie, ce dernier bénéficie une rémunération majorée à hauteur de **cent pour
> cent (100 %)**. »

`BankHoliday.is_workable` already marked exactly these days, so the majoration rides on
it — as a supplement on the amount, not a fourth band, since the hours were already
declared.

One trap it forced open: the **journée de solidarité** is `is_workable` like any other
worked holiday, and owes *nothing* — those hours are owed, not bought. One boolean
cannot say both, so `BankHoliday.is_solidarity` now tells them apart. Without it, marking
Pentecôte as worked would have quietly collected art. 47.2's 10%.

A worked 1 May is owed **double**.

### Gaps this feature has to close

The existing models were built for planning, not pay. Closing the gap needs:

| Gap | Why it matters |
| --- | --- |
| No `weeks_per_year` anywhere | The mensualisation formula turns on it |
| `mileage_rate` (€/km) has no km operand | A rate with nothing to multiply |
| No agreed *night presence* rate | URSSAF sets a **floor** (¼ of the rate), not the amount; the agreed figure has nowhere to live |
| `Contract.paid_leave_days` is inert | Stored and populated, never read; no balance exists |
| `Leave` is informational by design | Its own docstring says it "doesn't affect pay or schedule" — this feature is what makes it mean something |
| `Leave.hours` has no time of day | A bare count cannot be segmented, so it cannot be split between families |
| Weekly hours are not persisted | Only ever computed in a serializer from `ScheduleBlock` rows |
| No `Contract`↔`Child` link | §2 needs one |

### Time is naive local, everywhere

Django is configured `TIME_ZONE = "UTC"` with `USE_TZ = True`, while the whole schedule
side stores naive `TimeField`s. Keep the pay domain on naive `date` + `time` and **never
introduce an aware `DateTimeField` into it**. An aware 20:00 Paris persists as 18:00Z in
summer and 19:00Z in winter, so a night-presence test against 20:00 would be **wrong
twice a year**, and a 00:30 entry would land on the previous UTC date and shift the
month it is declared in.

## 4. What pajemploi actually asks for

Worth stating, because the form is the acceptance test for everything above. Quoting its
own field help:

> **Nombre d'heures au taux normal** — « Saisissez le nombre d'heures au taux normal à
> déclarer dans le mois. Si la garde est mensualisée : nombre d'heures mensualisées. Si la
> garde est occasionnelle : nombre d'heures réellement effectuées. »

> **Salaire net pour le mois** — « Additionnez le nombre d'heures normales (mensualisées ou
> réellement effectuées) x taux horaire net + le nombre d'heures supplémentaires à 25% x le
> taux horaire normal majoré à 25%. »

So the declared net salary **includes** the overtime, and the 25% and 50% hour counts go in
their own separate fields. The fields, in the order the form lays them out: hours at 25%,
hours at 50%, normal hours, the net salary, the total amount, then each advantage
(transport, kilometric, in-kind) on its own line — the UI mirrors that order so a parent
copies straight down. The total is the net wage due (net salary plus the night indemnity
and any worked-holiday majoration); the advantages are **not** rolled into it, because the
form collects them separately.

Everything in this codebase is **net**, because that is what pajemploi asks for. The
convention, however, defines majorations, floors and indemnities in **brut** — so any
comparison against a floor is a brut question wearing net clothes. `net × 1.25` is a close
enough approximation of `(brut × 1.25) → net` to use, but a *floor* check computed in net
is not the same test the convention specifies.

## Provenance of the quotes here

Legifrance renders the CCN through JavaScript and cannot be fetched, so the convention is
cited from the CGT's verbatim reproduction of IDCC 3239. Every quote in this document was
fetched and read, not taken second-hand.

`urssaf.fr` hangs our fetcher; `curl` with a browser User-Agent retrieves it fine.

**URSSAF's pages summarise the job; the convention states the rules.** Twice now the
summary has omitted a garde partagée rule that changes the money — présence responsable
(§1) and the split (§2). When they differ, the convention governs.

The machine-readable versions of these citations live in `backend/contracts/sources.py`,
so the same quote can back a docstring, an API warning, and a "why?" link in the UI.

[urssaf-contrat]: https://www.urssaf.fr/accueil/particulier/particulier-employeur/embaucher-un-salarie/contrat-travail-salarie-domicile.html#ancre-le-contenu-du-contrat-de-travail
[urssaf-cp]: https://www.urssaf.fr/accueil/particulier/particulier-employeur/gerer-les-absences/gestion-conges-payes.html
[cdtn-hs]: https://code.travail.gouv.fr/contribution/3239-heures-supplementaires
[ccn-47-1]: https://convention-collective-idcc3239.cgt.fr/socle-commun/article-47-1-1er-mai/
[ccn-47-2]: https://convention-collective-idcc3239.cgt.fr/socle-commun/article-47-2-jours-feries-ordinaires/
[ccn-137-1]: https://convention-collective-idcc3239.cgt.fr/socle-salarie-du-particulier-employeur/article-137-1-heures-de-presence-responsable-de-jour/
[ccn-137-2]: https://convention-collective-idcc3239.cgt.fr/socle-salarie-du-particulier-employeur/article-137-2-heures-de-presence-de-nuit/
[ccn-144-2]: https://convention-collective-idcc3239.cgt.fr/socle-salarie-du-particulier-employeur/article-144-2-dispositions-specifiques-liees-a-la-garde-partagee/
[ccn-146-1]: https://convention-collective-idcc3239.cgt.fr/socle-salarie-du-particulier-employeur/article-146-1-modalites-de-calcul-du-salaire-mensualise-en-cas-de-duree-du-travail-reguliere/
[ccn-146-2]: https://convention-collective-idcc3239.cgt.fr/socle-salarie-du-particulier-employeur/article-146-2-modalites-de-calcul-du-salaire-en-cas-de-duree-du-travail-irreguliere/
[ccn-152-1]: https://convention-collective-idcc3239.cgt.fr/socle-salarie-du-particulier-employeur/article-152-1-regime-des-absences-du-salarie-du-particulier-employeur/
