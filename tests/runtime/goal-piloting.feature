# mirrors schema · reflects: runtime.goalpiloting.PilotOpenGoal / runtime.goalpiloting.PilotCloseGoal
# · test_kind: gherkin · cert_language: godog · authority: above · liveness: live
#
# S66 — le /goal piloté par l'écran. Un humain PORTEUR D'AUTORITÉ (S63) ouvre un goal
# depuis une idée grilled ; le moteur (S29) écrit un ChangeSet DRAFT (Truth + Mirror) et
# calcule le VRAI set rouge. L'écran PROPOSE un ChangeSet, n'écrit JAMAIS le Kernel (le mur,
# §2). Le Stop reste NON-GAMEABLE (§57 ①/§8) : la fermeture est refusée tant que ≠
# (set rouge → vert ∧ vert antérieur intact ∧ mutation ≥ seuil ∧ aucun monstre).
Feature: un user porteur d'autorité pilote un /goal depuis l'écran sans jamais écrire le Kernel

  Scenario: ouvrir un goal depuis une idée grilled écrit un ChangeSet DRAFT et le vrai set rouge
    Given un acteur réel "u-amelie" affiché "Amélie Roy"
    And une idée grilled "réduire le prix d'une commande remisée" avec son mirror_delta
    When cet acteur ouvre un /goal depuis cette idée
    Then un ChangeSet DRAFT est proposé portant le spec_delta ET le mirror_delta
    And le set rouge calculé est non vide
    And le goal est OUVERT
    And aucune vérité du Kernel n'a été écrite

  Scenario: un acteur placeholder ne peut pas piloter un /goal
    Given un acteur réel "agent" affiché "agent"
    And une idée grilled "réduire le prix d'une commande remisée" avec son mirror_delta
    When cet acteur ouvre un /goal depuis cette idée
    Then l'ouverture est refusée avec le code "PLACEHOLDER_ACTOR"
    And aucun ChangeSet n'est ouvert

  Scenario: une idée sans mirror est refusée (un vœu, jamais un goal)
    Given un acteur réel "u-amelie" affiché "Amélie Roy"
    And une idée grilled "réduire le prix d'une commande remisée" sans mirror_delta
    When cet acteur ouvre un /goal depuis cette idée
    Then l'ouverture est refusée avec le code "IDEA_WITHOUT_MIRROR"
    And aucun ChangeSet n'est ouvert

  Scenario: fermer le goal est refusé tant qu'un miroir du set rouge reste rouge
    Given un goal ouvert dont le set rouge est "Order.discount.fixture"
    When on tente de fermer avec le set rouge encore rouge, vert antérieur intact, mutation 0.9, seuil 0.8, aucun monstre
    Then la fermeture est refusée avec le code "GOAL_STILL_RED"
    And le goal reste OUVERT

  Scenario: le goal se ferme seulement quand les quatre conditions tiennent
    Given un goal ouvert dont le set rouge est "Order.discount.fixture"
    When on tente de fermer avec le set rouge vert, vert antérieur intact, mutation 0.9, seuil 0.8, aucun monstre
    Then la fermeture est acceptée
    And le goal peut passer FERMÉ

  Scenario: un vert antérieur cassé, une mutation trop basse ou un monstre gardent le goal ouvert
    Given un goal ouvert dont le set rouge est "Order.discount.fixture"
    When on tente de fermer avec le set rouge vert, vert antérieur cassé, mutation 0.9, seuil 0.8, aucun monstre
    Then la fermeture est refusée avec le code "GOAL_STILL_RED"
    And le goal reste OUVERT
