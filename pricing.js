// Bảng giá dịch vụ - sửa số tiền tại đây theo giá bạn muốn bán
// amount: giá tiền (đ) cho mỗi "per" đơn vị số lượng
const SERVICES = {
  facebook: {
    like:   { label: "Facebook · Like bài viết", amount: 15000, per: 100 },
    follow: { label: "Facebook · Follow trang",  amount: 20000, per: 100 },
    view:   { label: "Facebook · Mắt live",      amount: 25000, per: 100 },
  },
  instagram: {
    like:   { label: "Instagram · Like ảnh",     amount: 12000, per: 100 },
    follow: { label: "Instagram · Follower",     amount: 22000, per: 100 },
    view:   { label: "Instagram · View reels",   amount: 8000,  per: 1000 },
  },
  tiktok: {
    like:   { label: "TikTok · Like video",      amount: 10000, per: 100 },
    follow: { label: "TikTok · Follower",        amount: 25000, per: 100 },
    view:   { label: "TikTok · View video",      amount: 5000,  per: 1000 },
  },
  youtube: {
    like:   { label: "YouTube · Like video",     amount: 18000, per: 100 },
    follow: { label: "YouTube · Subscriber",     amount: 35000, per: 100 },
    view:   { label: "YouTube · View video",     amount: 10000, per: 1000 },
  },
};

const WITHDRAW_FEE_RATE = 0.20;   // phí rút tiền 20%
const REF_LEVEL1_RATE = 0.10;     // hoa hồng cấp 1: 10%
const REF_LEVEL2_RATE = 0.05;     // hoa hồng cấp 2: 5%
const MIN_DEPOSIT = 10000;        // nạp tối thiểu

function getService(platform, category) {
  const p = SERVICES[String(platform).toLowerCase()];
  if (!p) return null;
  return p[String(category).toLowerCase()] || null;
}

function calcOrderTotal(platform, category, quantity) {
  const svc = getService(platform, category);
  if (!svc || !quantity || quantity <= 0) return null;
  return Math.round((svc.amount * quantity) / svc.per);
}

module.exports = {
  SERVICES,
  WITHDRAW_FEE_RATE,
  REF_LEVEL1_RATE,
  REF_LEVEL2_RATE,
  MIN_DEPOSIT,
  getService,
  calcOrderTotal,
};
