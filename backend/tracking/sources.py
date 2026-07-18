"""Where every rule in the pay domain comes from.

Structured rather than written into comments, because the same citation has three
audiences: a maintainer reading :mod:`tracking.declarations`, an API consumer
reading a warning, and (soon) a parent in the UI asking "says who?" about a
number they are being told to type into pajemploi. A comment serves the first
and abandons the other two.

So each rule is a :class:`Source` carrying the reference, the URL, and the
**verbatim French** it rests on. Quote the text, never a paraphrase: a paraphrase
is where the error creeps in, and this whole module exists because it already
did. Every quote below was fetched and read; none is second-hand.

**Provenance.** Legifrance renders the CCN through JavaScript and cannot be
scraped, so the convention's text is cited from the CGT's verbatim reproduction,
which is a union's transcription of IDCC 3239 rather than the official record.
Where URSSAF publishes the same rule, both are cited — URSSAF's pages are
plain-language summaries of the *job* and, twice now, have turned out to omit a
garde partagée rule the convention states (see :data:`PRESENCE_RESPONSABLE_SHARED_CARE`
and :data:`SHARED_CARE_SPLIT`). When the two disagree, **the convention governs
and the summary is the thing that is wrong**.

``urssaf.fr`` refuses our fetcher — the connection hangs. ``curl`` with a browser
User-Agent retrieves it fine; use that to re-check a quote.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Source:
    """One citable rule: what it is called, where it lives, and what it says."""

    ref: str
    url: str
    #: Verbatim, in French, as published. Never paraphrase it.
    quote: str

    def as_dict(self) -> dict[str, str]:
        """Shape handed to the API, and from there to a "why?" link in the UI."""
        return {"ref": self.ref, "url": self.url, "quote": self.quote}


CCN = "https://convention-collective-idcc3239.cgt.fr"
URSSAF_CONTRACT = (
    "https://www.urssaf.fr/accueil/particulier/particulier-employeur/embaucher-un-salarie"
    "/contrat-travail-salarie-domicile.html"
)

# --- the working week --------------------------------------------------------

WEEKLY_BANDS = Source(
    ref="URSSAF — Les différents types d'heures (garde d'enfants à domicile)",
    url=URSSAF_CONTRACT,
    quote=(
        "Heures normales : […] La durée hebdomadaire conventionnelle de travail est fixée à "
        "40 heures par semaine. Heures supplémentaires : elles correspondent aux heures "
        "effectuées au-delà de 40 heures par semaine, dans la limite de la durée maximale de "
        "travail. Elles donnent lieu à une majoration de 25 % (pour les 8 premières heures) et "
        "50 % (pour les heures supplémentaires au-delà de 8 heures)."
    ),
)

WEEKLY_BANDS_CORROBORATION = Source(
    ref="Code du travail numérique — IDCC 3239, heures supplémentaires",
    url="https://code.travail.gouv.fr/contribution/3239-heures-supplementaires",
    quote=(
        "au-delà de 40 heures par semaine [pour le salarié du particulier employeur ; "
        "au-delà de 45 heures par semaine pour l'assistant maternel]"
    ),
)

MAXIMUM_WEEK = Source(
    ref="CCN 3239, art. 134 — Durée maximale du travail",
    url=f"{CCN}/socle-salarie-du-particulier-employeur/article-134-duree-maximale-du-travail/",
    quote=(
        "48 heures en moyenne sur une période quelconque de 12 semaines consécutives, "
        "dans la limite de 50 heures par semaine."
    ),
)

# --- mensualisation ----------------------------------------------------------

MENSUALISATION = Source(
    ref="CCN 3239, art. 146.1 — Durée du travail régulière",
    url=(
        f"{CCN}/socle-salarie-du-particulier-employeur/article-146-1-modalites-de-calcul-du"
        "-salaire-mensualise-en-cas-de-duree-du-travail-reguliere/"
    ),
    quote="salaire horaire brut x nombre d'heures de travail hebdomadaire x 52 semaines / 12 mois.",
)

IRREGULAR_HOURS = Source(
    ref="CCN 3239, art. 146.2 — Durée du travail irrégulière",
    url=(
        f"{CCN}/socle-salarie-du-particulier-employeur/article-146-2-modalites-de-calcul-du"
        "-salaire-en-cas-de-duree-du-travail-irreguliere/"
    ),
    quote=(
        "Lorsque la durée du travail est irrégulière, le salaire est calculé à partir du "
        "salaire horaire brut, en fonction du nombre d'heures de travail effectif décomptées "
        "dans le mois."
    ),
)

PAJEMPLOI_NORMAL_HOURS = Source(
    ref="Pajemploi — Nombre d'heures au taux normal",
    url="https://www.pajemploi.urssaf.fr/",
    quote=(
        "Saisissez le nombre d'heures au taux normal à déclarer dans le mois. "
        "Si la garde est mensualisée : nombre d'heures mensualisées. "
        "Si la garde est occasionnelle : nombre d'heures réellement effectuées."
    ),
)

PAJEMPLOI_NET_SALARY = Source(
    ref="Pajemploi — Calculez le salaire net pour le mois",
    url="https://www.pajemploi.urssaf.fr/",
    quote=(
        "Additionnez le nombre d'heures normales (mensualisées ou réellement effectuées) "
        "x taux horaire net + le nombre d'heures supplémentaires à 25% x le taux horaire "
        "normal majoré à 25%."
    ),
)

# --- garde partagée ----------------------------------------------------------

SHARED_CARE_SPLIT = Source(
    ref="CCN 3239, art. 144.2 — Dispositions spécifiques liées à la garde partagée",
    url=(
        f"{CCN}/socle-salarie-du-particulier-employeur/article-144-2-dispositions-specifiques"
        "-liees-a-la-garde-partagee/"
    ),
    quote=(
        "En cas de garde partagée, chaque particulier employeur rémunère les heures de travail "
        "du salarié selon la répartition prévue aux termes des contrats de travail et des "
        "éventuels avenants conclus par chacun des particuliers employeurs avec le salarié."
    ),
)

SHARED_CARE_URSSAF_SUMMARY = Source(
    ref="URSSAF — En cas de garde partagée (résumé, non contraignant)",
    url=URSSAF_CONTRACT,
    quote=(
        "En cas de garde partagée, les deux employeurs devront s'entendre sur la planification "
        "des heures de garde. Cette répartition sera indiquée sur les contrats de travail, "
        "ainsi que le lieu de garde. Chaque famille rémunère les heures effectuées à son "
        "domicile selon les modalités définies au contrat de travail."
    ),
)

PRESENCE_RESPONSABLE_SHARED_CARE = Source(
    ref="CCN 3239, art. 137.1 — Heures de présence responsable de jour",
    url=(
        f"{CCN}/socle-salarie-du-particulier-employeur/article-137-1-heures-de-presence"
        "-responsable-de-jour/"
    ),
    quote=(
        "Les heures de présence responsable de jour sont exclues dans le cadre de la "
        "garde partagée."
    ),
)

PRESENCE_RESPONSABLE = Source(
    ref="CCN 3239, art. 137.1 — Heures de présence responsable de jour",
    url=(
        f"{CCN}/socle-salarie-du-particulier-employeur/article-137-1-heures-de-presence"
        "-responsable-de-jour/"
    ),
    quote=(
        "Une heure de présence responsable de jour équivaut aux deux-tiers (2/3) d'une heure de "
        "travail effectif. Pour le calcul de la durée de travail effectif hebdomadaire, les "
        "heures de présence responsable de jour sont prises en compte après leur conversion en "
        "heures de travail effectif. […] Les heures de présence responsable ne se présument pas "
        "et doivent être expressément prévues par écrit dans le contrat de travail."
    ),
)

# --- présence de nuit --------------------------------------------------------

NIGHT_PRESENCE = Source(
    ref="CCN 3239, art. 137.2 — Heures de présence de nuit",
    url=f"{CCN}/socle-salarie-du-particulier-employeur/article-137-2-heures-de-presence-de-nuit/",
    quote=(
        "La présence de nuit s'entend de l'obligation pour le salarié de dormir sur place, dans "
        "des conditions décentes au sein d'une pièce séparée, sans travail effectif habituel, "
        "tout en étant tenu d'intervenir, s'il y a lieu. […] La plage horaire de la nuit est "
        "comprise entre vingt heures (20 h) et six heures trente (6 h 30). Les parties peuvent "
        "aménager cette plage horaire […] dans la limite totale d'une heure trente (1 h 30). "
        "[…] la présence de nuit n'est pas prise en compte pour déterminer la durée de travail "
        "effectif."
    ),
)

NIGHT_INDEMNITY_FLOOR = Source(
    ref="URSSAF — Heures de présence de nuit (garde d'enfants à domicile)",
    url=URSSAF_CONTRACT,
    quote=(
        "Heures de présence de nuit : elles correspondent aux heures effectuées entre 20 heures "
        "et 6 heures 30, et sont rémunérées par une indemnité forfaitaire dont le montant ne "
        "peut être inférieur à un quart du salaire contractuel versé pour une durée de travail "
        "effectif équivalente. Cette présence ne peut pas excéder 12 heures consécutives."
    ),
)

NIGHT_INDEMNITY_TIERS = Source(
    ref="CCN 3239, art. 137.2 — Rémunération de la présence de nuit",
    url=f"{CCN}/socle-salarie-du-particulier-employeur/article-137-2-heures-de-presence-de-nuit/",
    quote=(
        "La présence de nuit est rémunérée par une indemnité forfaitaire dont le montant ne peut "
        "pas être inférieur à un quart (¼) du salaire contractuel versé pour une durée de "
        "travail effectif équivalente. Si certaines nuits, le salarié est appelé à intervenir : "
        "au moins deux (2) fois, l'indemnité forfaitaire due au titre de la nuit au cours de "
        "laquelle le salarié est intervenu, est portée à un tiers (1/3) du salaire contractuel "
        "versé pour une durée de travail effectif équivalente ; au moins quatre (4) fois, "
        "l'indemnité due pour la durée des interventions, correspond au salaire contractuel "
        "versé pour une durée de travail effectif équivalente. L'indemnité forfaitaire pour la "
        "présence de nuit restante est égale à un tiers (1/3) du salaire contractuel versé pour "
        "une durée de travail effectif équivalente. Si toutes les nuits, le salarié est amené à "
        "intervenir au moins quatre (4) fois, les heures de présence de nuit sont requalifiées "
        "en heures de travail effectif et le contrat de travail doit être revu."
    ),
)

# --- absences ----------------------------------------------------------------

UNPAID_ABSENCE = Source(
    ref="CCN 3239, art. 152.1 — Régime des absences",
    url=(
        f"{CCN}/socle-salarie-du-particulier-employeur/article-152-1-regime-des-absences-du"
        "-salarie-du-particulier-employeur/"
    ),
    quote=(
        "Lorsqu'il y a eu des périodes d'absence du salarié au cours du mois concerné, le "
        "particulier employeur applique la formule des « heures réelles » et le salaire à verser "
        "le mois considéré est calculé de la façon suivante : salaire mensualisé x nombre "
        "d'heures réellement effectuées dans le mois ÷ nombre d'heures qui auraient dû être "
        "réellement travaillées dans le mois considéré si le salarié n'avait pas été absent."
    ),
)

PAID_LEAVE_IN_BASE = Source(
    ref="URSSAF — Gestion des congés payés",
    url=(
        "https://www.urssaf.fr/accueil/particulier/particulier-employeur/gerer-les-absences"
        "/gestion-conges-payes.html"
    ),
    quote=(
        "Rémunération mensualisée sur 52 semaines (assistants maternels agréés et gardes "
        "d'enfants à domicile) — Les congés sont rémunérés lorsqu'ils sont pris. Le salaire "
        "mensualisé est versé tous les mois, y compris pendant les périodes de congés payés."
    ),
)

# --- jours fériés ------------------------------------------------------------

WORKED_MAY_FIRST = Source(
    ref="CCN 3239, art. 47.1 — 1er mai",
    url=f"{CCN}/socle-commun/article-47-1-1er-mai/",
    quote=(
        "[Lorsque le] 1er mai est un jour travaillé par le salarié. En contrepartie, ce dernier "
        "bénéficie une rémunération majorée à hauteur de cent pour cent (100 %)."
    ),
)

WORKED_HOLIDAY = Source(
    ref="CCN 3239, art. 47.2 — Jours fériés ordinaires",
    url=f"{CCN}/socle-commun/article-47-2-jours-feries-ordinaires/",
    quote=(
        "En contrepartie du travail un jour férié ordinaire, le salarié perçoit, au titre des "
        "heures effectuées, une rémunération majorée à hauteur de dix pour cent (10 %) du "
        "salaire dû."
    ),
)

UNWORKED_HOLIDAY = Source(
    ref="CCN 3239, art. 47.2 — Jours fériés ordinaires",
    url=f"{CCN}/socle-commun/article-47-2-jours-feries-ordinaires/",
    quote=(
        "Le chômage d'un jour férié ordinaire tombant un jour habituellement travaillé, ouvre "
        "droit au maintien de la rémunération brute habituelle, si le salarié a travaillé pour "
        "le particulier employeur, le dernier jour de travail qui précède le jour férié et le "
        "premier jour de travail qui lui fait suite, sauf autorisation d'absence préalablement "
        "accordée."
    ),
)


#: Every warning :func:`tracking.declarations.compute_month` can raise, and the
#: rule behind it. The API returns the code; the UI resolves it here, so a parent
#: can read the convention rather than take our word for a number.
WARNING_SOURCES: dict[str, Source] = {
    "rates_changed_mid_month": MENSUALISATION,
    "hours_reduced_for_absence": UNPAID_ABSENCE,
    "overlapping_solo_exceptional": SHARED_CARE_SPLIT,
    "night_presence_rate_below_floor": NIGHT_INDEMNITY_FLOOR,
    "night_presence_longer_than_12h": NIGHT_INDEMNITY_FLOOR,
    "night_presence_should_be_requalified": NIGHT_INDEMNITY_TIERS,
    "night_interventions_need_manual_pricing": NIGHT_INDEMNITY_TIERS,
    "presence_responsable_in_shared_care": PRESENCE_RESPONSABLE_SHARED_CARE,
    "split_without_children": SHARED_CARE_SPLIT,
}


def source_for(warning: str) -> Source | None:
    return WARNING_SOURCES.get(warning)
