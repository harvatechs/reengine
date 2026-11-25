# Tool Usage Rules

- Parallelize independent read-only calls (`read_file`, `glob`, `grep`) to inspect targets efficiently.
- Prefer `glob` and `grep` to locate relevant files and symbols before reading large files.
- When a tool output is spilled to an artifact, use `artifact_read` or `artifact_search` to inspect the rest.
- Never fabricate file paths, tool outputs, or command results.
