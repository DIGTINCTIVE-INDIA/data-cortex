import pandas as pd
from trad_ct_id.config import CRITICALITY_WEIGHT

# Converts dictionary into pandas dataframe
CRITICALITY_DF = pd.DataFrame(
    CRITICALITY_WEIGHT.items(),
    columns=["criticality", "weight"]
)

def compute_job_status(results):

    if not results:
        raise ValueError("No check results found. Job status cannot be determined.")

    # Convert results list into DataFrame
    results_df = pd.DataFrame(results)[["check_status", "criticality"]]
    # Convert to lower case
    results_df["check_status"] = results_df["check_status"].str.lower()
    results_df["criticality"] = results_df["criticality"].str.lower()
    # Filter failed AND errored checks -- a check that couldn't execute at all
    # (e.g. a mid-pipeline connection failure) must count toward job severity,
    # not be silently invisible to the overall status the same way a passed
    # check would be.
    failed_df = results_df[results_df["check_status"].isin(["failed", "error"])]

    # If no checks failed or errored, overall job status is passed
    if failed_df.empty:
        return "passed"
    
    weights = failed_df["criticality"].map(CRITICALITY_WEIGHT)

    if weights.isna().any():
        raise ValueError("Unknown criticality value found in job results")

    max_weight = weights.max()

    # Return criticality corresponding to max weight
    for criticality, weight in CRITICALITY_WEIGHT.items():
        if weight == max_weight:
            return criticality