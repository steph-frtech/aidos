# language: fr
Fonctionnalité: Plans, métrage déterministe & quotas (S114)
  L'agent économique customer-facing : un compte a un plan, sa consommation est
  COMPTÉE depuis les AgentRun enregistrés (jamais estimée, jamais un LLM), et un build
  au-delà du quota est REFUSÉ avec un chemin d'upgrade — jamais un échec silencieux.

  Scénario: un build sous le quota est autorisé
    Étant donné un compte "acct-1" sur le plan "free"
    Et un run "r1" du projet "p1" consommant 10000 tokens et 5 minutes de build-loop
    Quand je métre la consommation du compte
    Et je vérifie le quota
    Alors le verdict est "allow"

  Scénario: un build au-delà du quota tokens est refusé avec QUOTA_EXCEEDED et un chemin d'upgrade
    Étant donné un compte "acct-2" sur le plan "free"
    Et un run "r2" du projet "p1" consommant 200000 tokens et 1 minutes de build-loop
    Quand je métre la consommation du compte
    Et je vérifie le quota
    Alors le verdict est "deny"
    Et le refus porte le code "QUOTA_EXCEEDED"
    Et le refus est actionnable avec un chemin d'upgrade vers "pro"

  Scénario: le métrage est exactement attribuable par projet
    Étant donné un compte "acct-3" sur le plan "pro"
    Et un run "r3" du projet "p1" consommant 30000 tokens et 2 minutes de build-loop
    Et un run "r4" du projet "p2" consommant 70000 tokens et 4 minutes de build-loop
    Quand je métre le projet "p1"
    Alors la consommation tokens vaut 30000

  Scénario: un webhook provider rejoué est idempotent
    Étant donné un compte "acct-4" sur le plan "free"
    Et un webhook "checkout.completed" du provider "evt_42" pour "acct-4" vers le plan "pro"
    Quand j'ingère le webhook deux fois
    Alors un seul événement est enregistré
    Et le plan appliqué est "pro"
