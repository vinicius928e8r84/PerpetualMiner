# Only people who can write to the repository count in the PR record

The check "Registro da PR" reads the comments and reviews of a PR to find the record of the `/code-review`, and counts only those whose author is an owner, a member or a collaborator. In a public repository anyone can comment, so a comment from anyone else could otherwise release a PR.
