/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         VAY NGAY — Backend Server v3.0                   ║
 * ║  Express.js + MongoDB Atlas                              ║
 * ║  DB: cluster0.nswegis.mongodb.net/vayngay               ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Routes:                                                 ║
 * ║   AUTH    : /api/auth/register|login                     ║
 * ║   USERS   : /api/users                                   ║
 * ║   KYC     : /api/kyc                                     ║
 * ║   LOANS   : /api/applications                            ║
 * ║   REPAY   : /api/repayments                              ║
 * ║   STATS   : /api/stats                                   ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 *  Setup:
 *    npm install
 *    node server.js   OR   npm run dev
 *
 *  Thư mục:
 *    vayngay/
 *    ├── server.js
 *    ├── .env
 *    ├── package.json
 *    └── public/
 *        ├── index.html
 *        └── admin.html
 */

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const crypto   = require('crypto');
const multer   = require('multer');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
//  MONGODB
// ─────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI ||
  'mongodb+srv://haikieu539_db_user:haideplol@cluster0.nswegis.mongodb.net/vayngay?appName=Cluster0';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB Atlas connected — cluster0.nswegis.mongodb.net/vayngay');
    startCron();
  })
  .catch(e => { console.error('❌  MongoDB error:', e.message); process.exit(1); });

// ─────────────────────────────────────────────────────────────
//  MULTER — File upload (CCCD / Face images)
// ─────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|jpg|png|webp)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh JPG/PNG/WEBP'));
  },
});

// ─────────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir)); // serve uploaded images

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
const ok   = (res, data, s = 200) => res.status(s).json({ success: true,  ...data });
const fail = (res, msg,  s = 400) => res.status(s).json({ success: false, message: msg });
const hashPw = pw => crypto.createHash('sha256').update(pw + 'vayngay_salt_2024').digest('hex');
const fmtCurrency = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';

// ─────────────────────────────────────────────────────────────
//  SCHEMAS
// ─────────────────────────────────────────────────────────────

/* ── USER ── */
const UserSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  phone:     { type: String, required: true, unique: true, trim: true },
  email:     { type: String, required: true, trim: true },
  cccd:      { type: String, required: true, unique: true, trim: true },
  dob:       { type: String, required: true },
  password:  { type: String, required: true },
  address:   { type: String, required: true, trim: true },
  isActive:  { type: Boolean, default: true },
  kycStatus: { type: String, default: 'pending', enum: ['pending', 'submitted', 'verified', 'rejected'] },
  kycNote:   { type: String, default: '' },
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);

/* ── KYC ── */
const KycSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phone:        { type: String, required: true },
  cccdFront:    { type: String, default: '' },   // file path
  cccdBack:     { type: String, default: '' },
  faceImage:    { type: String, default: '' },
  cccdFrontB64: { type: String, default: '' },   // base64 fallback
  cccdBackB64:  { type: String, default: '' },
  faceImageB64: { type: String, default: '' },
  status:       { type: String, default: 'submitted', enum: ['submitted', 'verified', 'rejected'] },
  adminNote:    { type: String, default: '' },
  verifiedAt:   { type: Date, default: null },
  verifiedBy:   { type: String, default: '' },
  submittedAt:  { type: Date, default: Date.now },
}, { timestamps: true });
const Kyc = mongoose.model('Kyc', KycSchema);

/* ── LOAN ── */
const LoanSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name:         { type: String, required: true },
  phone:        { type: String, required: true },
  cccd:         { type: String },
  dob:          { type: String },
  address:      { type: String },
  income:       { type: String },
  purpose:      { type: String },
  job:          { type: String },
  bank:         { type: String },
  bankAccount:  { type: String },

  loanAmount:   { type: Number, required: true },
  loanLabel:    { type: String },
  interest:     { type: Number, required: true },
  proof:        { type: Number, required: true },
  total:        { type: Number, required: true },
  disburse:     { type: Number, required: true },
  remaining:    { type: Number },               // số dư còn lại

  planMonths:   { type: Number, required: true },
  planPerMonth: { type: Number, required: true },
  planLabel:    { type: String },

  status: {
    type: String, default: 'reviewing',
    enum: ['reviewing','approved','pending_payment','pending','disbursed','overdue','paid','rejected'],
  },
  paidConfirm:  { type: Boolean, default: false },
  disburseTime: { type: Date,    default: null },
  dueDate:      { type: Date,    default: null },
  adminNote:    { type: String,  default: '' },
  disbursedBy:  { type: String,  default: '' },
  submitTime:   { type: Date,    default: Date.now },
}, { timestamps: true });
const Loan = mongoose.model('Loan', LoanSchema);

/* ── REPAYMENT (lịch sử thanh toán) ── */
const RepaymentSchema = new mongoose.Schema({
  loanId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', required: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  phone:       { type: String, required: true },
  amount:      { type: Number, required: true },
  type:        { type: String, default: 'monthly', enum: ['monthly','full','partial','penalty'] },
  note:        { type: String, default: '' },
  confirmedBy: { type: String, default: 'customer' }, // 'customer' | 'admin'
  status:      { type: String, default: 'pending', enum: ['pending', 'confirmed', 'rejected'] },
  paidAt:      { type: Date, default: Date.now },
  confirmedAt: { type: Date, default: null },
  adminNote:   { type: String, default: '' },

  // Snapshot sau khi trả
  remainingAfter: { type: Number, default: 0 },
  penalty:        { type: Number, default: 0 },
}, { timestamps: true });
const Repayment = mongoose.model('Repayment', RepaymentSchema);

// ─────────────────────────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, email, cccd, dob, password, address } = req.body;
    if (!name || !phone || !email || !cccd || !dob || !password || !address)
      return fail(res, 'Vui lòng điền đầy đủ thông tin bắt buộc.');
    if (password.length < 6)
      return fail(res, 'Mật khẩu tối thiểu 6 ký tự.');

    const exists = await User.findOne({ $or: [{ phone }, { cccd }] });
    if (exists)
      return fail(res, exists.phone === phone ? 'Số điện thoại đã được đăng ký.' : 'CCCD đã được đăng ký.', 409);

    const user = await User.create({
      name: name.trim(), phone: phone.trim(), email: email.trim(),
      cccd: cccd.trim(), dob, address: address.trim(),
      password: hashPw(password),
    });
    const { password: _, ...safe } = user.toObject();
    return ok(res, { message: 'Đăng ký thành công!', data: safe }, 201);
  } catch (e) { return fail(res, e.message, 500); }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return fail(res, 'Vui lòng nhập đầy đủ.');
    const user = await User.findOne({ phone: phone.trim() });
    if (!user) return fail(res, 'Số điện thoại chưa được đăng ký.', 404);
    if (user.password !== hashPw(password)) return fail(res, 'Mật khẩu không đúng.', 401);
    if (!user.isActive) return fail(res, 'Tài khoản đã bị khóa. Liên hệ admin.', 403);
    const { password: _, ...safe } = user.toObject();
    return ok(res, { message: 'Đăng nhập thành công!', data: safe });
  } catch (e) { return fail(res, e.message, 500); }
});

// ─────────────────────────────────────────────────────────────
//  USER ROUTES (admin)
// ─────────────────────────────────────────────────────────────

// GET /api/users
app.get('/api/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (search) filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter, { password: 0 })
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    return ok(res, { total, page: parseInt(page), data: users });
  } catch (e) { return fail(res, e.message, 500); }
});

// PATCH /api/users/:id/toggle — khóa/mở tài khoản
app.patch('/api/users/:id/toggle', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 'Không tìm thấy người dùng.', 404);
    user.isActive = !user.isActive;
    await user.save();
    return ok(res, { message: `Tài khoản đã ${user.isActive ? 'mở khóa' : 'khóa'}.`, data: user });
  } catch (e) { return fail(res, e.message, 500); }
});

// ─────────────────────────────────────────────────────────────
//  KYC ROUTES
// ─────────────────────────────────────────────────────────────

// POST /api/kyc — nộp hồ sơ KYC (upload file)
app.post('/api/kyc',
  upload.fields([
    { name: 'cccdFront', maxCount: 1 },
    { name: 'cccdBack',  maxCount: 1 },
    { name: 'faceImage', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { userId, phone, cccdFrontB64, cccdBackB64, faceImageB64 } = req.body;
      if (!userId || !phone) return fail(res, 'Thiếu userId hoặc phone.');

      // Ảnh từ file upload hoặc base64
      const cccdFront  = req.files?.cccdFront?.[0]?.filename  || '';
      const cccdBack   = req.files?.cccdBack?.[0]?.filename   || '';
      const faceImage  = req.files?.faceImage?.[0]?.filename  || '';

      // Upsert KYC record
      const kyc = await Kyc.findOneAndUpdate(
        { userId },
        {
          userId, phone,
          cccdFront, cccdBack, faceImage,
          cccdFrontB64: cccdFrontB64 || '',
          cccdBackB64:  cccdBackB64  || '',
          faceImageB64: faceImageB64 || '',
          status:      'submitted',
          submittedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      // Cập nhật kycStatus của user
      await User.findByIdAndUpdate(userId, { kycStatus: 'submitted' });

      return ok(res, { message: 'Nộp KYC thành công! Đang chờ xét duyệt.', data: kyc }, 201);
    } catch (e) { return fail(res, e.message, 500); }
  }
);

// POST /api/kyc/base64 — nộp KYC qua base64 (không cần form-data)
app.post('/api/kyc/base64', async (req, res) => {
  try {
    const { userId, phone, cccdFrontB64, cccdBackB64, faceImageB64 } = req.body;
    if (!userId || !phone) return fail(res, 'Thiếu userId hoặc phone.');

    const kyc = await Kyc.findOneAndUpdate(
      { userId },
      {
        userId, phone,
        cccdFrontB64: cccdFrontB64 || '',
        cccdBackB64:  cccdBackB64  || '',
        faceImageB64: faceImageB64 || '',
        status:      'submitted',
        submittedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(userId, { kycStatus: 'submitted' });
    return ok(res, { message: 'Nộp KYC thành công!', data: kyc }, 201);
  } catch (e) { return fail(res, e.message, 500); }
});

// GET /api/kyc — danh sách KYC (admin)
app.get('/api/kyc', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Kyc.countDocuments(filter);
    const data  = await Kyc.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(parseInt(limit));
    return ok(res, { total, data });
  } catch (e) { return fail(res, e.message, 500); }
});

// GET /api/kyc/user/:userId — KYC của 1 user
app.get('/api/kyc/user/:userId', async (req, res) => {
  try {
    const kyc = await Kyc.findOne({ userId: req.params.userId });
    return ok(res, { data: kyc || null });
  } catch (e) { return fail(res, e.message, 500); }
});

// PATCH /api/kyc/:id/verify — admin duyệt/từ chối KYC
app.patch('/api/kyc/:id/verify', async (req, res) => {
  try {
    const { status, adminNote, verifiedBy } = req.body;
    if (!['verified', 'rejected'].includes(status))
      return fail(res, 'Status phải là verified hoặc rejected.');

    const kyc = await Kyc.findByIdAndUpdate(
      req.params.id,
      { status, adminNote: adminNote || '', verifiedAt: new Date(), verifiedBy: verifiedBy || 'admin' },
      { new: true }
    );
    if (!kyc) return fail(res, 'Không tìm thấy KYC.', 404);

    // Sync kycStatus sang User
    await User.findByIdAndUpdate(kyc.userId, {
      kycStatus: status === 'verified' ? 'verified' : 'rejected',
      kycNote:   adminNote || '',
    });

    return ok(res, { message: `KYC đã ${status === 'verified' ? 'được duyệt' : 'bị từ chối'}.`, data: kyc });
  } catch (e) { return fail(res, e.message, 500); }
});

// ─────────────────────────────────────────────────────────────
//  LOAN ROUTES
// ─────────────────────────────────────────────────────────────

// POST /api/applications
app.post('/api/applications', async (req, res) => {
  try {
    const {
      userId, name, phone, cccd, dob, address,
      income, purpose, job, bank, bankAccount,
      loanAmount, loanLabel, interest, proof, total, disburse,
      planMonths, planPerMonth, planLabel,
    } = req.body;

    if (!name || !phone || !loanAmount || !planMonths)
      return fail(res, 'Thiếu thông tin bắt buộc.');

    const active = await Loan.findOne({ phone, status: { $nin: ['paid', 'rejected'] } });
    if (active)
      return fail(res, 'Bạn đang có khoản vay chưa hoàn tất. Vui lòng tất toán trước khi vay mới.', 409);

    const calc_interest = interest || Math.round(loanAmount / 1000000 * 200000);
    const calc_proof    = proof    || Math.round(loanAmount * 0.3);
    const calc_total    = total    || loanAmount + calc_interest;
    const calc_disburse = disburse || loanAmount + calc_proof;

    const loan = await Loan.create({
      userId: userId || null, name, phone, cccd, dob, address,
      income, purpose, job, bank, bankAccount,
      loanAmount, loanLabel,
      interest: calc_interest, proof: calc_proof, total: calc_total, disburse: calc_disburse,
      remaining: calc_total,
      planMonths, planPerMonth, planLabel,
    });
    return ok(res, { message: 'Đơn đăng ký thành công!', data: loan }, 201);
  } catch (e) { return fail(res, e.message, 500); }
});

// GET /api/applications
app.get('/api/applications', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search) filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { cccd:  { $regex: search, $options: 'i' } },
    ];
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Loan.countDocuments(filter);
    const data  = await Loan.find(filter).sort({ submitTime: -1 }).skip(skip).limit(parseInt(limit));
    return ok(res, { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), data });
  } catch (e) { return fail(res, e.message, 500); }
});

// GET /api/applications/my/:phone — đơn của 1 user
app.get('/api/applications/my/:phone', async (req, res) => {
  try {
    const data = await Loan.find({ phone: req.params.phone }).sort({ submitTime: -1 });
    return ok(res, { total: data.length, data });
  } catch (e) { return fail(res, e.message, 500); }
});

// GET /api/applications/:id
app.get('/api/applications/:id', async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return fail(res, 'Không tìm thấy đơn vay.', 404);
    return ok(res, { data: loan });
  } catch (e) { return fail(res, e.message, 500); }
});

// PATCH /api/applications/:id/status
app.patch('/api/applications/:id/status', async (req, res) => {
  try {
    const { status, adminNote, disbursedBy } = req.body;
    const valid = ['reviewing','approved','pending_payment','pending','disbursed','overdue','paid','rejected'];
    if (!valid.includes(status)) return fail(res, 'Trạng thái không hợp lệ.');

    const now = new Date();
    const update = { status, updatedAt: now };
    if (adminNote  !== undefined) update.adminNote  = adminNote;
    if (disbursedBy !== undefined) update.disbursedBy = disbursedBy;

    if (status === 'disbursed') {
      const loan = await Loan.findById(req.params.id);
      if (!loan) return fail(res, 'Không tìm thấy đơn vay.', 404);
      const due = new Date(now);
      due.setMonth(due.getMonth() + (loan.planMonths || 1));
      update.disburseTime = now;
      update.dueDate      = due;
      update.paidConfirm  = true;
      update.remaining    = loan.total;
    }

    const updated = await Loan.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return fail(res, 'Không tìm thấy đơn vay.', 404);
    return ok(res, { message: 'Cập nhật thành công.', data: updated });
  } catch (e) { return fail(res, e.message, 500); }
});

// POST /api/applications/:id/confirm-payment — khách xác nhận đã TT 30%
app.post('/api/applications/:id/confirm-payment', async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return fail(res, 'Không tìm thấy đơn vay.', 404);
    if (['disbursed','paid'].includes(loan.status))
      return fail(res, 'Khoản vay đã được giải ngân rồi.', 400);

    const now = new Date(), due = new Date(now);
    due.setMonth(due.getMonth() + (loan.planMonths || 1));

    const updated = await Loan.findByIdAndUpdate(req.params.id, {
      status: 'pending_payment', paidConfirm: true,
      disburseTime: now, dueDate: due, updatedAt: now,
      remaining: loan.total,
    }, { new: true });

    return ok(res, {
      message: 'Xác nhận thành công! Admin sẽ duyệt và giải ngân trong 15–30 phút.',
      data: {
        ...updated.toObject(),
        disburseDateFormatted: now.toLocaleDateString('vi-VN'),
        dueDateFormatted:      due.toLocaleDateString('vi-VN'),
      },
    });
  } catch (e) { return fail(res, e.message, 500); }
});

// DELETE /api/applications/delete-all
app.delete('/api/applications/delete-all', async (req, res) => {
  try {
    const r = await Loan.deleteMany({});
    return ok(res, { message: `Đã xóa ${r.deletedCount} đơn vay.` });
  } catch (e) { return fail(res, e.message, 500); }
});

// DELETE /api/applications/:id
app.delete('/api/applications/:id', async (req, res) => {
  try {
    const d = await Loan.findByIdAndDelete(req.params.id);
    if (!d) return fail(res, 'Không tìm thấy đơn vay.', 404);
    return ok(res, { message: 'Đã xóa đơn vay thành công.' });
  } catch (e) { return fail(res, e.message, 500); }
});

// ─────────────────────────────────────────────────────────────
//  REPAYMENT ROUTES
// ─────────────────────────────────────────────────────────────

// POST /api/repayments — khách xác nhận đã trả tiền
app.post('/api/repayments', async (req, res) => {
  try {
    const { loanId, userId, phone, amount, type, note } = req.body;
    if (!loanId || !phone || !amount) return fail(res, 'Thiếu thông tin bắt buộc.');

    const loan = await Loan.findById(loanId);
    if (!loan) return fail(res, 'Không tìm thấy khoản vay.', 404);
    if (['paid', 'rejected'].includes(loan.status))
      return fail(res, 'Khoản vay này không thể thanh toán.', 400);

    // Tính phí phạt nếu quá hạn
    const now = new Date();
    const isOverdue = loan.dueDate && now > loan.dueDate;
    const daysLate  = isOverdue ? Math.ceil((now - loan.dueDate) / (1000 * 60 * 60 * 24)) : 0;
    const penalty   = isOverdue ? daysLate * 2000 + Math.round((loan.remaining || loan.total) * 0.01) : 0;

    const remainingAfter = Math.max(0, (loan.remaining || loan.total) - Number(amount));

    const repay = await Repayment.create({
      loanId, userId: userId || null, phone,
      amount: Number(amount),
      type:   type || 'partial',
      note:   note || '',
      status: 'pending',
      penalty,
      remainingAfter,
      confirmedBy: 'customer',
    });

    // Tự động cập nhật trạng thái loan (pending review)
    await Loan.findByIdAndUpdate(loanId, {
      adminNote: `Khách xác nhận đã trả ${fmtCurrency(amount)} ngày ${now.toLocaleDateString('vi-VN')}`,
    });

    return ok(res, {
      message: 'Xác nhận thanh toán thành công! Admin sẽ xác minh trong 30 phút.',
      data: repay,
    }, 201);
  } catch (e) { return fail(res, e.message, 500); }
});

// GET /api/repayments — danh sách (admin)
app.get('/api/repayments', async (req, res) => {
  try {
    const { status, loanId, phone, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (loanId) filter.loanId = loanId;
    if (phone)  filter.phone  = phone;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await Repayment.countDocuments(filter);
    const data  = await Repayment.find(filter).sort({ paidAt: -1 }).skip(skip).limit(parseInt(limit));
    return ok(res, { total, data });
  } catch (e) { return fail(res, e.message, 500); }
});

// GET /api/repayments/loan/:loanId — lịch sử trả của 1 khoản vay
app.get('/api/repayments/loan/:loanId', async (req, res) => {
  try {
    const data = await Repayment.find({ loanId: req.params.loanId }).sort({ paidAt: -1 });
    const totalPaid = data.filter(r => r.status === 'confirmed').reduce((s, r) => s + r.amount, 0);
    return ok(res, { total: data.length, totalPaid, data });
  } catch (e) { return fail(res, e.message, 500); }
});

// PATCH /api/repayments/:id/confirm — admin duyệt thanh toán
app.patch('/api/repayments/:id/confirm', async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    if (!['confirmed', 'rejected'].includes(status))
      return fail(res, 'Status phải là confirmed hoặc rejected.');

    const repay = await Repayment.findByIdAndUpdate(
      req.params.id,
      { status, adminNote: adminNote || '', confirmedAt: new Date(), confirmedBy: 'admin' },
      { new: true }
    );
    if (!repay) return fail(res, 'Không tìm thấy giao dịch.', 404);

    // Nếu duyệt → cập nhật remaining của loan
    if (status === 'confirmed') {
      const loan = await Loan.findById(repay.loanId);
      if (loan) {
        const newRemaining = Math.max(0, (loan.remaining || loan.total) - repay.amount);
        const newStatus    = newRemaining <= 0 ? 'paid' : loan.status;
        await Loan.findByIdAndUpdate(repay.loanId, {
          remaining: newRemaining,
          status:    newStatus,
          ...(newStatus === 'paid' ? { paidAt: new Date() } : {}),
        });
      }
    }

    return ok(res, {
      message: `Thanh toán đã ${status === 'confirmed' ? 'được duyệt' : 'bị từ chối'}.`,
      data: repay,
    });
  } catch (e) { return fail(res, e.message, 500); }
});

// ─────────────────────────────────────────────────────────────
//  STATS
// ─────────────────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const [
      total, reviewing, approved, pendingPayment, pending,
      disbursed, overdue, paid, rejected, totalUsers,
      kycSubmitted, kycVerified, kycRejected,
      repayPending, repayConfirmed,
    ] = await Promise.all([
      Loan.countDocuments(),
      Loan.countDocuments({ status: 'reviewing' }),
      Loan.countDocuments({ status: 'approved' }),
      Loan.countDocuments({ status: 'pending_payment' }),
      Loan.countDocuments({ status: 'pending' }),
      Loan.countDocuments({ status: 'disbursed' }),
      Loan.countDocuments({ status: 'overdue' }),
      Loan.countDocuments({ status: 'paid' }),
      Loan.countDocuments({ status: 'rejected' }),
      User.countDocuments(),
      Kyc.countDocuments({ status: 'submitted' }),
      Kyc.countDocuments({ status: 'verified' }),
      Kyc.countDocuments({ status: 'rejected' }),
      Repayment.countDocuments({ status: 'pending' }),
      Repayment.countDocuments({ status: 'confirmed' }),
    ]);

    const disbursedLoans = await Loan.find(
      { status: { $in: ['disbursed', 'overdue', 'paid'] } },
      { loanAmount: 1, proof: 1, interest: 1, remaining: 1 }
    );
    const totalDisbursed = disbursedLoans.reduce((s, l) => s + (l.loanAmount || 0), 0);
    const totalInterest  = disbursedLoans.reduce((s, l) => s + (l.interest   || 0), 0);
    const totalProofFees = disbursedLoans.reduce((s, l) => s + (l.proof      || 0), 0);

    // Tổng đã thu từ repayments
    const repayAgg = await Repayment.aggregate([
      { $match: { status: 'confirmed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalCollected = repayAgg[0]?.total || 0;

    const [incomeGroups, purposeGroups, loanAmountGroups, dailyLoans] = await Promise.all([
      Loan.aggregate([{ $group: { _id: '$income',    count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Loan.aggregate([{ $group: { _id: '$purpose',   count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Loan.aggregate([{ $group: { _id: '$loanLabel', count: { $sum: 1 }, totalAmt: { $sum: '$loanAmount' } } }, { $sort: { totalAmt: -1 } }]),
      Loan.aggregate([
        { $match: { submitTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$submitTime' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return ok(res, {
      data: {
        counts: {
          total, reviewing, approved, pendingPayment, pending,
          disbursed, overdue, paid, rejected, totalUsers,
          kycSubmitted, kycVerified, kycRejected,
          repayPending, repayConfirmed,
        },
        financials: {
          totalDisbursed, totalInterest, totalProofFees,
          totalCollected, totalRevenue: totalInterest,
          totalOutstanding: totalDisbursed - totalCollected,
        },
        incomeGroups, purposeGroups, loanAmountGroups, dailyLoans,
      },
    });
  } catch (e) { return fail(res, e.message, 500); }
});

// ─────────────────────────────────────────────────────────────
//  HEALTH & STATIC
// ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({
  success: true, status: 'ok', message: 'VayNgay API v3.0 🚀',
  db:      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  dbUri:   'cluster0.nswegis.mongodb.net/vayngay',
  version: '3.0.0', time: new Date().toISOString(),
}));

app.get('/',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use((req, res) => fail(res, `Route ${req.method} ${req.path} không tồn tại.`, 404));

// ─────────────────────────────────────────────────────────────
//  CRON — Tự động đánh dấu quá hạn mỗi giờ
// ─────────────────────────────────────────────────────────────

function startCron() {
  setInterval(async () => {
    try {
      const r = await Loan.updateMany(
        { status: 'disbursed', dueDate: { $lt: new Date() } },
        { $set: { status: 'overdue' } }
      );
      if (r.modifiedCount > 0)
        console.log(`⚠️  Auto-overdue: ${r.modifiedCount} khoản vay`);
    } catch (e) { console.error('Cron error:', e.message); }
  }, 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         VAY NGAY BACKEND v3.0 — STARTED          ║');
  console.log(`║  🌐  http://localhost:${PORT}                       ║`);
  console.log(`║  👤  http://localhost:${PORT}/            (khách)   ║`);
  console.log(`║  🛠️   http://localhost:${PORT}/admin       (admin)   ║`);
  console.log(`║  📡  http://localhost:${PORT}/api/health            ║`);
  console.log(`║  🍃  DB: cluster0.nswegis.mongodb.net/vayngay      ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  API Routes:                                      ║');
  console.log('║  POST /api/auth/register|login                    ║');
  console.log('║  GET|PATCH /api/users                             ║');
  console.log('║  POST|GET|PATCH /api/kyc                          ║');
  console.log('║  POST|GET|PATCH|DELETE /api/applications          ║');
  console.log('║  POST|GET|PATCH /api/repayments                   ║');
  console.log('║  GET /api/stats                                   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
