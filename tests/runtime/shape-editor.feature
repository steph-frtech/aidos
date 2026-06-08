# language: fr
# S68 — Éditeur par forme + concurrence draft-level (ROADMAP-app-builder S68, AIDOS Mirror).
# La forme du miroir est DÉRIVÉE de la nature de la vérité (jamais choisie à la main) ; un miroir
# autorisé est rouge à la naissance et persisté project-scopé via ChangeSet DRAFT (le mur) ; deux
# éditions concurrentes du brouillon fusionnent ou se verrouillent, jamais last-write-wins.
# reflects=runtime.shapeeditor · test_kind=acceptance · cert_language=gherkin · authority=above · liveness=live.

Fonctionnalité: Autorat des trois formes de miroir avec concurrence au niveau brouillon

  Scénario: La forme Gherkin est dérivée d'une vérité d'acceptation N0
    Quand je dérive la forme pour la nature "acceptance"
    Alors la forme dérivée est "gherkin"
    Et le test_kind dérivé est "acceptance"

  Scénario: La forme propriété est dérivée d'un invariant ∀ N1
    Quand je dérive la forme pour la nature "invariant"
    Alors la forme dérivée est "property"
    Et le test_kind dérivé est "property"

  Scénario: La forme fixture est dérivée d'un workflow N2
    Quand je dérive la forme pour la nature "workflow"
    Alors la forme dérivée est "fixture"
    Et le test_kind dérivé est "fixture"

  Scénario: Une nature inconnue n'a aucune forme devinée
    Quand je dérive la forme pour la nature "pas-une-nature"
    Alors la dérivation est refusée

  Scénario: Un miroir autorisé naît rouge et project-scopé via un ChangeSet DRAFT
    Étant donné un brouillon de miroir pour la nature "workflow" sur la couche "Order.discount" du projet "proj-1"
    Et la source du brouillon est une fixture valide
    Quand je propose le miroir
    Alors le miroir proposé est rouge
    Et la proposition est un ChangeSet DRAFT project-scopé "proj-1"
    Et la proposition n'écrit aucune vérité miroir
