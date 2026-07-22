"""Backward-compatible export — PatternService is PatternEvaluator. """

from app.patterns.evaluator import PatternEvaluator as PatternService

__all__ = ["PatternService"]
