---
id: helios-deploy
project: Helios
type: reference
title: GitOps deploys via ArgoCD
topic: deploy argocd kubernetes gitops release rollback
tags: [deploy, gitops]
importance: 2
updated: 2026-06-18
---
Services are deployed to Kubernetes via GitOps: ArgoCD reconciles the cluster to the desired state declared in the deploy repository. Releases are promoted environment by environment, and rollbacks are a git revert.
