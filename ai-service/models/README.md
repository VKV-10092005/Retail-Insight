# Only official verified artifacts belong here. Do not commit weights or credentials.
# hybrid.manifest.json must specify version, the exact feature_order from app/algorithms.py,
# blend [0.25,0.75], categories for every categorical field, and files.general / files.specialist
# each with name and sha256. Each file contains a fitted predict-compatible estimator.
# stockout.manifest.json must specify version, exact STOCKOUT_FEATURES, threshold 0.3299,
# files.classifier with name/sha256 containing the fitted predict_proba-compatible estimator.
# Existing joblib dictionaries must be reviewed and exported to this layout without calling fit.
# No artifact is activated automatically from a user upload or research ZIP.
