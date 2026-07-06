export function errorHandler(err, req, res, next) {
  console.error("[legion] Error:", err);

  // Multer file-validation errors (size limit, bad file type) are safe and useful
  // to show the user directly, unlike most 500s.
  if (err.name === "MulterError" || /Only JPG, PNG, WEBP or PDF/.test(err.message || "")) {
    return res.status(400).json({ error: err.message });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || "Something went wrong. Please try again.",
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: "Route not found" });
}
