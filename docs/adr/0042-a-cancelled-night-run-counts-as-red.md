# A cancelled night run counts as red

The nightly issue treats a `cancelled` run as red: the `timeout-minutes` of the job cuts it and it ends `cancelled`, which is exactly the hang the night run looks for. A manual cancellation of the run does not get there, because the job of the workflow has `!cancelled()`.
