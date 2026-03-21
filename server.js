require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MONGODB ───────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI ||
  'mongodb+srv://haikieu539_db_user:haideplol@cluster0.nswegis.mongodb.net/vayngay?appName=Cluster0';

mongoose.connect(MONGO_URI)
  .then(() => { console.log('✅  MongoDB Atlas connected — cluster0.nswegis.mongodb.net'); startCron(); })
  .catch(err => { console.error('❌  MongoDB failed:', err.message); process.exit(1); });

// ─── MIDDLEWARE ────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── HELPERS ───────────────────────────────────────────────
const ok   = (res, data, s=200) => res.status(s).json({ success:true,  ...data });
const fail = (res, msg,  s=400) => res.status(s).json({ success:false, message:msg });
const hashPw = pw => crypto.createHash('sha256').update(pw+'vayngay_salt_2024').digest('hex');

// ─── USER SCHEMA ───────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  name:      { type:String, required:true, trim:true },
  phone:     { type:String, required:true, unique:true, trim:true },
  email:     { type:String, required:true, trim:true },
  cccd:      { type:String, required:true, unique:true, trim:true },
  dob:       { type:String, required:true },
  password:  { type:String, required:true },
  address:   { type:String, required:true, trim:true },
  isActive:  { type:Boolean, default:true },
}, { timestamps:true });
const User = mongoose.model('User', UserSchema);

// ─── LOAN SCHEMA ───────────────────────────────────────────
const LoanSchema = new mongoose.Schema({
  userId:       { type:mongoose.Schema.Types.ObjectId, ref:'User', default:null },
  name:         { type:String, required:true },
  phone:        { type:String, required:true },
  cccd:         { type:String },
  dob:          { type:String },
  address:      { type:String },
  // Loan numbers
  loanAmount:   { type:Number, required:true },
  loanLabel:    { type:String },
  interest:     { type:Number, required:true },
  proof:        { type:Number, required:true },
  total:        { type:Number, required:true },
  disburse:     { type:Number, required:true },
  // Plan
  planMonths:   { type:Number, required:true },
  planPerMonth: { type:Number, required:true },
  planLabel:    { type:String },
  // Application info
  income:       { type:String },
  purpose:      { type:String },
  job:          { type:String },
  bank:         { type:String },
  bankAccount:  { type:String },
  // Status
  status: {
    type:String, default:'reviewing',
    enum:['reviewing','approved','pending_payment','pending','disbursed','overdue','paid','rejected'],
  },
  paidConfirm:  { type:Boolean, default:false },
  disburseTime: { type:Date,    default:null },
  dueDate:      { type:Date,    default:null },
  adminNote:    { type:String,  default:'' },
  disbursedBy:  { type:String,  default:'' },
  submitTime:   { type:Date,    default:Date.now },
}, { timestamps:true });
const Loan = mongoose.model('Loan', LoanSchema);

// ══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req,res) => {
  try {
    const { name, phone, email, cccd, dob, password, address } = req.body;
    if (!name||!phone||!email||!cccd||!dob||!password||!address)
      return fail(res,'Vui lòng điền đầy đủ thông tin bắt buộc.');
    if (password.length < 6)
      return fail(res,'Mật khẩu tối thiểu 6 ký tự.');

    const exists = await User.findOne({ $or:[{phone},{cccd}] });
    if (exists) return fail(res, exists.phone===phone ? 'Số điện thoại đã được đăng ký.' : 'CCCD đã được đăng ký.', 409);

    const user = await User.create({ name:name.trim(), phone:phone.trim(), email:email.trim(), cccd:cccd.trim(), dob, address:address.trim(), password:hashPw(password) });
    const { password:_, ...safe } = user.toObject();
    return ok(res, { message:'Đăng ký thành công!', data:safe }, 201);
  } catch(e) { return fail(res,e.message,500); }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req,res) => {
  try {
    const { phone, password } = req.body;
    if (!phone||!password) return fail(res,'Vui lòng nhập đầy đủ.');
    const user = await User.findOne({ phone:phone.trim() });
    if (!user) return fail(res,'Số điện thoại chưa được đăng ký.',404);
    if (user.password !== hashPw(password)) return fail(res,'Mật khẩu không đúng.',401);
    if (!user.isActive) return fail(res,'Tài khoản đã bị khóa. Liên hệ admin.',403);
    const { password:_, ...safe } = user.toObject();
    return ok(res, { message:'Đăng nhập thành công!', data:safe });
  } catch(e) { return fail(res,e.message,500); }
});

// GET /api/users  (admin)
app.get('/api/users', async (req,res) => {
  try {
    const { search, page=1, limit=50 } = req.query;
    const filter = {};
    if (search) filter.$or = [
      { name:  {$regex:search,$options:'i'} },
      { phone: {$regex:search,$options:'i'} },
      { email: {$regex:search,$options:'i'} },
    ];
    const skip  = (parseInt(page)-1)*parseInt(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter,{password:0}).sort({createdAt:-1}).skip(skip).limit(parseInt(limit));
    return ok(res,{total, page:parseInt(page), data:users});
  } catch(e) { return fail(res,e.message,500); }
});

// PATCH /api/users/:id/toggle  (admin)
app.patch('/api/users/:id/toggle', async (req,res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res,'Không tìm thấy người dùng.',404);
    user.isActive = !user.isActive;
    await user.save();
    return ok(res,{ message:`Tài khoản đã ${user.isActive?'mở khóa':'khóa'}.`, data:user });
  } catch(e) { return fail(res,e.message,500); }
});

// ══════════════════════════════════════════════════════════
//  LOAN ROUTES
// ══════════════════════════════════════════════════════════

// POST /api/applications
app.post('/api/applications', async (req,res) => {
  try {
    const { name, phone, cccd, dob, address, income, purpose, job, bank, bankAccount,
            loanAmount, loanLabel, interest, proof, total, disburse,
            planMonths, planPerMonth, planLabel, userId } = req.body;

    if (!name||!phone||!loanAmount||!planMonths) return fail(res,'Thiếu thông tin bắt buộc.');

    const active = await Loan.findOne({ phone, status:{$nin:['paid','rejected']} });
    if (active) return fail(res,'Bạn đang có khoản vay chưa hoàn tất.',409);

    const loan = await Loan.create({
      userId:userId||null, name, phone, cccd, dob, address,
      income, purpose, job, bank, bankAccount,
      loanAmount, loanLabel,
      interest:    interest    || Math.round(loanAmount/1000000*200000),
      proof:       proof       || Math.round(loanAmount*0.3),
      total:       total       || loanAmount+Math.round(loanAmount/1000000*200000),
      disburse:    disburse    || loanAmount+Math.round(loanAmount*0.3),
      planMonths, planPerMonth, planLabel,
    });
    return ok(res,{ message:'Đơn đăng ký thành công!', data:loan },201);
  } catch(e) { return fail(res,e.message,500); }
});

// GET /api/applications
app.get('/api/applications', async (req,res) => {
  try {
    const { status, search, page=1, limit=100 } = req.query;
    const filter = {};
    if (status&&status!=='all') filter.status = status;
    if (search) filter.$or = [
      { name:  {$regex:search,$options:'i'} },
      { phone: {$regex:search,$options:'i'} },
      { cccd:  {$regex:search,$options:'i'} },
    ];
    const skip  = (parseInt(page)-1)*parseInt(limit);
    const total = await Loan.countDocuments(filter);
    const data  = await Loan.find(filter).sort({submitTime:-1}).skip(skip).limit(parseInt(limit));
    return ok(res,{total, page:parseInt(page), pages:Math.ceil(total/parseInt(limit)), data});
  } catch(e) { return fail(res,e.message,500); }
});

// GET /api/applications/my/:phone
app.get('/api/applications/my/:phone', async (req,res) => {
  try {
    const data = await Loan.find({phone:req.params.phone}).sort({submitTime:-1});
    return ok(res,{total:data.length,data});
  } catch(e) { return fail(res,e.message,500); }
});

// GET /api/applications/:id
app.get('/api/applications/:id', async (req,res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return fail(res,'Không tìm thấy đơn vay.',404);
    return ok(res,{data:loan});
  } catch(e) { return fail(res,e.message,500); }
});

// PATCH /api/applications/:id/status
app.patch('/api/applications/:id/status', async (req,res) => {
  try {
    const { status, adminNote, disbursedBy } = req.body;
    const valid = ['reviewing','approved','pending_payment','pending','disbursed','overdue','paid','rejected'];
    if (!valid.includes(status)) return fail(res,'Trạng thái không hợp lệ.');

    const now = new Date();
    const update = { status, updatedAt:now };
    if (adminNote  !==undefined) update.adminNote  = adminNote;
    if (disbursedBy!==undefined) update.disbursedBy = disbursedBy;

    if (status==='disbursed') {
      const loan = await Loan.findById(req.params.id);
      if (!loan) return fail(res,'Không tìm thấy đơn vay.',404);
      const due = new Date(now); due.setMonth(due.getMonth()+(loan.planMonths||1));
      update.disburseTime = now; update.dueDate = due; update.paidConfirm = true;
    }

    const updated = await Loan.findByIdAndUpdate(req.params.id,update,{new:true});
    if (!updated) return fail(res,'Không tìm thấy đơn vay.',404);
    return ok(res,{message:'Cập nhật thành công.',data:updated});
  } catch(e) { return fail(res,e.message,500); }
});

// POST /api/applications/:id/confirm-payment
app.post('/api/applications/:id/confirm-payment', async (req,res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return fail(res,'Không tìm thấy đơn vay.',404);
    if (['disbursed','paid'].includes(loan.status)) return fail(res,'Khoản vay đã được giải ngân.',400);

    const now = new Date(), due = new Date(now);
    due.setMonth(due.getMonth()+(loan.planMonths||1));

    const updated = await Loan.findByIdAndUpdate(req.params.id,{
      status:'pending_payment', paidConfirm:true,
      disburseTime:now, dueDate:due, updatedAt:now,
    },{new:true});

    return ok(res,{
      message:'Xác nhận thành công! Admin sẽ duyệt và giải ngân trong 15-30 phút.',
      data:{ ...updated.toObject(), disburseDateFormatted:now.toLocaleDateString('vi-VN'), dueDateFormatted:due.toLocaleDateString('vi-VN') },
    });
  } catch(e) { return fail(res,e.message,500); }
});

// DELETE /api/applications/delete-all
app.delete('/api/applications/delete-all', async (req,res) => {
  try {
    const r = await Loan.deleteMany({});
    return ok(res,{message:`Đã xóa ${r.deletedCount} đơn vay.`});
  } catch(e) { return fail(res,e.message,500); }
});

// DELETE /api/applications/:id
app.delete('/api/applications/:id', async (req,res) => {
  try {
    const d = await Loan.findByIdAndDelete(req.params.id);
    if (!d) return fail(res,'Không tìm thấy đơn vay.',404);
    return ok(res,{message:'Đã xóa đơn vay thành công.'});
  } catch(e) { return fail(res,e.message,500); }
});

// ══════════════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════════════
app.get('/api/stats', async (req,res) => {
  try {
    const [total,reviewing,approved,pendingPayment,pending,disbursed,overdue,paid,rejected,totalUsers] = await Promise.all([
      Loan.countDocuments(),
      Loan.countDocuments({status:'reviewing'}),
      Loan.countDocuments({status:'approved'}),
      Loan.countDocuments({status:'pending_payment'}),
      Loan.countDocuments({status:'pending'}),
      Loan.countDocuments({status:'disbursed'}),
      Loan.countDocuments({status:'overdue'}),
      Loan.countDocuments({status:'paid'}),
      Loan.countDocuments({status:'rejected'}),
      User.countDocuments(),
    ]);

    const disbursedLoans = await Loan.find({status:{$in:['disbursed','overdue','paid']}},{loanAmount:1,proof:1,interest:1});
    const totalDisbursed = disbursedLoans.reduce((s,l)=>s+(l.loanAmount||0),0);
    const totalInterest  = disbursedLoans.reduce((s,l)=>s+(l.interest||0),0);
    const totalProofFees = disbursedLoans.reduce((s,l)=>s+(l.proof||0),0);

    const [incomeGroups, purposeGroups, loanAmountGroups, dailyLoans] = await Promise.all([
      Loan.aggregate([{$group:{_id:'$income',count:{$sum:1}}},{$sort:{count:-1}}]),
      Loan.aggregate([{$group:{_id:'$purpose',count:{$sum:1}}},{$sort:{count:-1}}]),
      Loan.aggregate([{$group:{_id:'$loanLabel',count:{$sum:1},totalAmt:{$sum:'$loanAmount'}}},{$sort:{totalAmt:-1}}]),
      Loan.aggregate([
        {$match:{submitTime:{$gte:new Date(Date.now()-7*24*60*60*1000)}}},
        {$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$submitTime'}},count:{$sum:1}}},
        {$sort:{_id:1}},
      ]),
    ]);

    return ok(res,{data:{
      counts:{total,reviewing,approved,pendingPayment,pending,disbursed,overdue,paid,rejected,totalUsers},
      financials:{totalDisbursed,totalInterest,totalProofFees,totalRevenue:totalInterest},
      incomeGroups, purposeGroups, loanAmountGroups, dailyLoans,
    }});
  } catch(e) { return fail(res,e.message,500); }
});

// ══════════════════════════════════════════════════════════
//  HEALTH & STATIC
// ══════════════════════════════════════════════════════════
app.get('/api/health', (req,res) => res.json({
  success:true, status:'ok', message:'VayNgay API 🚀',
  db: mongoose.connection.readyState===1 ? 'connected':'disconnected',
  dbUri:'cluster0.nswegis.mongodb.net/vayngay', version:'2.0.0',
  time:new Date().toISOString(),
}));

app.get('/',     (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/admin',(req,res) => res.sendFile(path.join(__dirname,'public','admin.html')));
app.use((req,res) => fail(res,`Route ${req.method} ${req.path} không tồn tại.`,404));

// ══════════════════════════════════════════════════════════
//  CRON
// ══════════════════════════════════════════════════════════
function startCron() {
  setInterval(async () => {
    try {
      const r = await Loan.updateMany({status:'disbursed',dueDate:{$lt:new Date()}},{$set:{status:'overdue'}});
      if (r.modifiedCount>0) console.log(`⚠️  Auto-overdue: ${r.modifiedCount} khoản`);
    } catch(e) { console.error('Cron error:',e.message); }
  }, 60*60*1000);
}

// ══════════════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════╗');
  console.log('║      VAY NGAY BACKEND v2.0 — STARTED       ║');
  console.log(`║  🌐 http://localhost:${PORT}                 ║`);
  console.log(`║  👤 http://localhost:${PORT}/                ║`);
  console.log(`║  🛠  http://localhost:${PORT}/admin           ║`);
  console.log(`║  📡 http://localhost:${PORT}/api/health       ║`);
  console.log(`║  🍃 DB: cluster0.nswegis.mongodb.net        ║`);
  console.log('╚════════════════════════════════════════════╝');
});

module.exports = app;
