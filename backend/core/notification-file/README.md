# notification-file

WIGTN 외주 코어 `notification-file` module.

Tier1 scope:

- transactional mail port for non-auth emails;
- in-app notification port;
- recipient resolution rules for shared domain events;
- upload validation and object-key policy;
- Supabase Storage signed-upload adapter;
- dependency-free mock adapters for tests/internal preview.

See [`module-contract-v0.md`](./module-contract-v0.md) for the contract.
