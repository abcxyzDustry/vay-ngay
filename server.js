/**
 * ============================================================
 * VAY NGAY — Backend Server
 * Express.js + MongoDB (Mongoose)
 * Author: VayNgay System
 * ============================================================
 */

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const dotenv     = require('dotenv');
const path       = require('path');

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (index.html, admin.html) from /public
app.use(express.static(path.join(__dirname, 'public')));

// ─── MONGODB CONNECTION ───────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI ||
'mongodb+srv://djthewolf9_db_user:haideptre@cluster0.fs703g5.mongodb.net/vayngay?appName=Cluster0';

mongoose.connect(MONGO_URI, {
useNewUrlParser:    true,
useUnifiedTopology: true,
})
.then(() => console.log('✅  MongoDB connected successfully'))
.catch(err => {
console.error('❌  MongoDB connection error:', err.message);
process.exit(1);
});

// ─── SCHEMAS & MODELS ─────────────────────────────────────────

/**
 * LoanApplication Schema
 */
const loanApplicationSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  phone:        { type: String, required: true, trim: true },
  cccd:         { type: String, required: true, trim: true },
  dob:          { type: String, required: true },
  income:       { type: String, required: true },
  purpose:      { type: String, required: true },
  address:      { type: String, required: true, trim: true },

  // Loan details
  loanAmount:   { type: Number, default: 2000000 },
  payPercent:   { type: Number, default: 600000 },   // 30%
  interest:     { type: Number, default: 200000 },   // fixed interest
  totalRepay:   { type: Number, default: 2200000 },  // loanAmount + interest

  // Status: 'reviewing' | 'approved' | 'pending_payment' | 'disbursed' | 'overdue' | 'paid'
  status:       { type: String, default: 'reviewing', enum: ['reviewing','approved','pending_payment','disbursed','overdue','paid'] },

  paidConfirm:  { type: Boolean, default: false },
  disburseTime: { type: Date,    default: null },
  dueDate:      { type: Date,    default: null },

  // Admin notes
  adminNote:    { type: String, default: '' },

  submitTime:   { type: Date, default: Date.now },
}, {
  timestamps: true,  // adds createdAt & updatedAt
});

const LoanApplication = mongoose.model('LoanApplication', loanApplicationSchema);

// ─── HELPER ───────────────────────────────────────────────────
const respond = (res, status, data) => res.status(status).json(data);

// ─── ROUTES ───────────────────────────────────────────────────

/**
 * GET /api/health
 * Health check
 */
app.get('/api/health', (req, res) => {
  respond(res, 200, {
    status: 'ok',
    message: 'VayNgay API is running 🚀',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  });
});

/**
 * POST /api/applications
 * Submit a new loan application
 */
app.post('/api/applications', async (req, res) => {
  try {
    const { name, phone, cccd, dob, income, purpose, address } = req.body;
    
    // Basic validation
    if (!name || !phone || !cccd || !dob || !income || !purpose || !address) {
      return respond(res, 400, { success: false, message: 'Vui lòng điền đầy đủ thông tin bắt buộc.' });
    }
    
    // Check duplicate phone or CCCD (optional — remove if not needed)
    const existing = await LoanApplication.findOne({
      $or: [{ phone }, { cccd }],
      status: { $nin: ['paid'] },
    });
    if (existing) {
      return respond(res, 409, {
        success: false,
        message: 'Số điện thoại hoặc CCCD đã có đơn vay đang hoạt động.',
      });
    }
    
    const app = await LoanApplication.create({
      name, phone, cccd, dob, income, purpose, address,
    });
    
    respond(res, 201, {
      success: true,
      message: 'Đơn đăng ký đã được gửi thành công.',
      data: app,
    });
  } catch (err) {
    console.error('POST /api/applications error:', err);
    respond(res, 500, { success: false, message: 'Lỗi máy chủ nội bộ.', error: err.message });
  }
});

/**
 * GET /api/applications
 * List all applications (admin)
 * Query params: status, search, page, limit
 */
app.get('/api/applications', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { cccd:  { $regex: search, $options: 'i' } },
      ];
    }
    
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await LoanApplication.countDocuments(filter);
    const apps  = await LoanApplication.find(filter)
      .sort({ submitTime: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    respond(res, 200, {
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: apps,
    });
  } catch (err) {
    console.error('GET /api/applications error:', err);
    respond(res, 500, { success: false, message: 'Lỗi máy chủ.', error: err.message });
  }
});

/**
 * GET /api/applications/:id
 * Get single application by ID
 */
app.get('/api/applications/:id', async (req, res) => {
  try {
    const app = await LoanApplication.findById(req.params.id);
    if (!app) return respond(res, 404, { success: false, message: 'Không tìm thấy đơn vay.' });
    respond(res, 200, { success: true, data: app });
  } catch (err) {
    respond(res, 500, { success: false, message: 'Lỗi máy chủ.', error: err.message });
  }
});

/**
 * PATCH /api/applications/:id/status
 * Update application status (admin & client actions)
 * Body: { status, adminNote }
 */
app.patch('/api/applications/:id/status', async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const validStatuses = ['reviewing', 'approved', 'pending_payment', 'disbursed', 'overdue', 'paid'];
    
    if (!validStatuses.includes(status)) {
      return respond(res, 400, { success: false, message: 'Trạng thái không hợp lệ.' });
    }
    
    const update = { status };
    if (adminNote !== undefined) update.adminNote = adminNote;
    
    // Auto-set disburseTime and dueDate when disbursed
    if (status === 'disbursed') {
      const now = new Date();
      const due = new Date(now);
      due.setMonth(due.getMonth() + 1);
      update.disburseTime = now;
      update.dueDate      = due;
      update.paidConfirm  = true;
    }
    
    const updated = await LoanApplication.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return respond(res, 404, { success: false, message: 'Không tìm thấy đơn vay.' });
    
    respond(res, 200, { success: true, message: 'Cập nhật trạng thái thành công.', data: updated });
  } catch (err) {
    respond(res, 500, { success: false, message: 'Lỗi máy chủ.', error: err.message });
  }
});

/**
 * POST /api/applications/:id/confirm-payment
 * Client confirms 30% payment → triggers disburse
 */
app.post('/api/applications/:id/confirm-payment', async (req, res) => {
  try {
    const app = await LoanApplication.findById(req.params.id);
    if (!app) return respond(res, 404, { success: false, message: 'Không tìm thấy đơn vay.' });
    if (app.status === 'disbursed') {
      return respond(res, 400, { success: false, message: 'Khoản vay đã được giải ngân rồi.' });
    }
    
    const now = new Date();
    const due = new Date(now);
    due.setMonth(due.getMonth() + 1);
    
    const updated = await LoanApplication.findByIdAndUpdate(
      req.params.id,
      {
        status:       'disbursed',
        paidConfirm:  true,
        disburseTime: now,
        dueDate:      due,
      },
      { new: true }
    );
    
    respond(res, 200, {
      success: true,
      message: 'Giải ngân thành công! Vui lòng trả nợ đúng hạn.',
      data: {
        ...updated.toObject(),
        disburseDateFormatted: now.toLocaleDateString('vi-VN'),
        dueDateFormatted:      due.toLocaleDateString('vi-VN'),
      },
    });
  } catch (err) {
    respond(res, 500, { success: false, message: 'Lỗi máy chủ.', error: err.message });
  }
});

/**
 * DELETE /api/applications/:id
 * Delete a single application (admin)
 */
app.delete('/api/applications/:id', async (req, res) => {
  try {
    const deleted = await LoanApplication.findByIdAndDelete(req.params.id);
    if (!deleted) return respond(res, 404, { success: false, message: 'Không tìm thấy đơn vay.' });
    respond(res, 200, { success: true, message: 'Đã xoá đơn vay thành công.' });
  } catch (err) {
    respond(res, 500, { success: false, message: 'Lỗi máy chủ.', error: err.message });
  }
});

/**
 * DELETE /api/applications
 * Delete ALL applications (admin — use carefully!)
 */
app.delete('/api/applications', async (req, res) => {
  try {
    const result = await LoanApplication.deleteMany({});
    respond(res, 200, {
      success: true,
      message: `Đã xoá ${result.deletedCount} đơn vay.`,
    });
  } catch (err) {
    respond(res, 500, { success: false, message: 'Lỗi máy chủ.', error: err.message });
  }
});

/**
 * GET /api/stats
 * Dashboard statistics for admin
 */
app.get('/api/stats', async (req, res) => {
  try {
    const [total, reviewing, approved, pendingPayment, disbursed, overdue, paid] = await Promise.all([
      LoanApplication.countDocuments(),
      LoanApplication.countDocuments({ status: 'reviewing' }),
      LoanApplication.countDocuments({ status: 'approved' }),
      LoanApplication.countDocuments({ status: 'pending_payment' }),
      LoanApplication.countDocuments({ status: 'disbursed' }),
      LoanApplication.countDocuments({ status: 'overdue' }),
      LoanApplication.countDocuments({ status: 'paid' }),
    ]);
    
    const totalDisbursedAmount = disbursed * 2000000;
    const totalRevenue         = disbursed * 200000; // interest
    const totalFees            = disbursed * 600000; // 30% proof fee
    
    // Income distribution
    const incomeGroups = await LoanApplication.aggregate([
      { $group: { _id: '$income', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    
    // Purpose distribution
    const purposeGroups = await LoanApplication.aggregate([
      { $group: { _id: '$purpose', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    
    respond(res, 200, {
      success: true,
      data: {
        counts: { total, reviewing, approved, pendingPayment, disbursed, overdue, paid },
        financials: { totalDisbursedAmount, totalRevenue, totalFees },
        incomeGroups,
        purposeGroups,
      },
    });
  } catch (err) {
    respond(res, 500, { success: false, message: 'Lỗi máy chủ.', error: err.message });
  }
});

// ─── CRON: Auto-mark overdue loans ───────────────────────────
// Runs every hour to check for overdue loans
setInterval(async () => {
  try {
    const now = new Date();
    const result = await LoanApplication.updateMany(
      { status: 'disbursed', dueDate: { $lt: now } },
      { $set: { status: 'overdue' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`⚠️  Marked ${result.modifiedCount} loan(s) as overdue`);
    }
  } catch (err) {
    console.error('Overdue cron error:', err.message);
  }
}, 60 * 60 * 1000); // every 1 hour

// ─── 404 handler ─────────────────────────────────────────────
app.use((req, res) => {
  respond(res, 404, { success: false, message: `Route ${req.method} ${req.path} không tồn tại.` });
});

// ─── START SERVER ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║       VAY NGAY — SERVER STARTED      ║');
  console.log(`║  🌐  http://localhost:${PORT}           ║`);
  console.log(`║  📦  MongoDB: Cluster0                ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
