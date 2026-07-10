import IdempotencyKey from "../models/IdempotencyKey.js";

/**
 * Protects an endpoint against duplicate execution when the client sends the
 * same `Idempotency-Key` header twice - e.g. a double-tap on "Release funds",
 * or a client retrying after a dropped connection without knowing whether the
 * first request actually landed.
 *
 * Usage: router.post("/release", idempotent("release_milestone"), releaseMilestone)
 *
 * Behavior:
 * - No `Idempotency-Key` header -> passes through untouched (opt-in, not required).
 * - First time this (key, user, route) is seen -> proceeds normally, then caches
 *   the response so a retry gets the identical result instead of re-running the
 *   handler.
 * - A retry while the original request is still in flight -> 409, rather than
 *   racing the same money-moving logic twice concurrently.
 * - A retry after the original completed -> replays the cached response with
 *   the original status code, without touching the handler at all.
 */
export function idempotent(routeName) {
  return async function idempotencyMiddleware(req, res, next) {
    const key = req.header("Idempotency-Key");
    if (!key) return next();

    try {
      // Atomic get-or-create: only the first caller actually inserts, so two
      // concurrent requests with the same key can't both proceed past this point.
      const existing = await IdempotencyKey.findOneAndUpdate(
        { key, user: req.user._id, route: routeName },
        { $setOnInsert: { key, user: req.user._id, route: routeName, status: "pending" } },
        { upsert: true, new: false }
      );

      if (existing) {
        if (existing.status === "pending") {
          return res.status(409).json({ error: "This request is already being processed. Please wait a moment." });
        }
        return res.status(existing.statusCode).json(existing.responseBody);
      }
    } catch (err) {
      return next(err);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      IdempotencyKey.updateOne(
        { key, user: req.user._id, route: routeName },
        { status: "done", statusCode: res.statusCode, responseBody: body }
      ).catch((err) => console.error("[legion] Failed to finalize idempotency record:", err.message));
      return originalJson(body);
    };
    next();
  };
}
