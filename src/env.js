try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on environment-supplied variables
}
