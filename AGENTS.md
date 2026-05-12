# Agents / CI Commands

## Lint
```bash
pip install ruff
ruff check packages/
```

## Tests
```bash
pytest packages/cv-core/tests/ -v
pytest packages/pose-biomechanics/tests/ -v
pytest packages/ml-models/tests/ -v
```

## All tests
```bash
pytest packages/ -v
```
