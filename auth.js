const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "doi-chuoi-bi-mat-nay-truoc-khi-chay-that";

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Chưa đăng nhập." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Phiên đăng nhập hết hạn, vui lòng đăng nhập lại." });
  }
}

function adminRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Chưa đăng nhập quản trị." });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    if (!data.isAdmin) return res.status(403).json({ error: "Không có quyền quản trị." });
    req.admin = data;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Phiên quản trị hết hạn." });
  }
}

module.exports = { signToken, authRequired, adminRequired, JWT_SECRET };
