# Security Specification & Test-Driven Design (TDD)

## 1. Data Invariants
- **Public Read Access**: Any user (even unauthenticated guests) can view categories and building details.
- **Admin-Only Write Access**: Only authenticated accounts with verified administrator status can create, update, or delete categories and buildings.
- **Admin Verification**: An account is an admin if:
  1. Its Google account email is `ekifebriann16@gmail.com` with `email_verified == true`.
  2. Or, it is registered in the `/databases/$(database)/documents/admins/` database collection.
- **Strict Data Validation**:
  - Buildings must contain logical name, category, description, and location strings (bounded sizing), non-zero positive number of floors, and a well-formed array of photo URLs.
  - Creation dates (`createdAt`) must be identical to the server request time (`request.time`).
  - Update dates (`updatedAt`) must be identical to the server request time (`request.time`).
  - IDs must conform to standard formats to prevent resource injection attacks.

---

## 2. The "Dirty Dozen" Payloads
These payloads are designed to challenge data integrity, identity, and RBAC:

1. **Anonymous Building Addition**: Unauthenticated user attempts to add a new building.
2. **Standard User Building Addition**: Non-admin authenticated user attempts to write to the `buildings` collection.
3. **Spoofed Admin Writing**: Authenticated user with email `ekifebriann16@gmail.com` but `email_verified == false` attempts to write.
4. **Self-Appointed Administrator**: Authenticated user attempts to write to `admins/` node to claim admin status.
5. **No-Size-Check Name**: Admin attempts to assign a 2MB string to a building name.
6. **No-Floor-Count**: Admin attempts to create a building with a negative number of floors (e.g. `-5`).
7. **Empty Photo Array**: Admin attempts to create a building with a malformed gallery data structure (not a list, or non-string indices).
8. **Spoofed Creation Date**: Admin attempts to create a building with a fake historical `createdAt` timestamp (e.g. 5 years ago) instead of `request.time`.
9. **Bypassing Category Invariant**: Admin attempts to create a building reference referencing a category ID that does not exist.
10. **Shadow Key Update**: Admin attempts to inject administrative shadow parameters or additional unsupported fields during updating.
11. **Immortality Bypass**: Admin tries to change the `createdAt` or `createdBy` field of an existing building during an update.
12. **Malicious ID Injection**: Attackers try to exploit Firestore queries by creating documents with highly nested or massive junk characters in IDs (e.g., `../../../junk`).

---

## 3. Fortress Rule Mapping
These payloads will be programmatically blocked by our `firestore.rules` file which will be carefully audited and deployed.
