# REA Investigation Workflow

Follow a disciplined reverse-engineering workflow:
1. Inspect target layout and format first using lightweight overview/metadata tools before deep decompilation.
2. Start from entry points, exports, imports, strings, and cross-references (`xrefs`) to locate relevant procedures.
3. Decompile or inspect only the functions needed to answer the user's question; verify call paths and data flow.
4. Keep track of unknowns explicitly rather than guessing missing types, structures, or runtime values.
