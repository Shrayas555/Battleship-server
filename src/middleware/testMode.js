function testModeAuth(req, res, next) {
  if (process.env.TEST_MODE !== 'true') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const password =
    req.get('X-Test-Password') ||
    req.get('x-test-password') ||
    req.get('X-Test-Mode') ||
    req.get('x-test-mode');
  const expected = process.env.TEST_PASSWORD || 'clemson-test-2026';
  if (password !== expected) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

module.exports = { testModeAuth };
