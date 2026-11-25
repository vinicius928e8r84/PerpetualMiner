# The e2e suite is sliced by the measured duration of each spec

In CI the e2e suite is cut into slices that are lists of specs, built from the real duration of each one (`scripts/ci/fatias-e2e.json`), instead of using the `--shard=N/8` of Playwright. The shard splits by the number of tests, and a test takes from 0.9 to 9 seconds, so one slice took 9 minutes while another took 3; the CI waits for the slowest. The price is a file of durations that has to be redone when specs change a lot.
