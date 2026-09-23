require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const { resolveMongoUri } = require('./config/database');

// Router imports
const { router: userRoutes } = require('./components/user');
const { authenticateAdmin } = require('./middlewares/auth');
const { User } = require('./models/user');
const { router: productRoutes } = require('./components/product');
const { router: orderRoutes } = require('./components/order');
const { router: chipRoutes } = require('./components/chip');
const { router: chipTypeRoutes } = require('./components/chiptypes');
const { router: cartRoutes } = require('./components/cart');
const { router: manageRoutes } = require('./components/manage');
const { router: iporderRoutes } = require('./components/iporder');
const { router: eporderRoutes } = require('./components/eporder');
const { router: historyRoutes } = require('./components/storagehistory');
const { router: activityLogRoutes } = require('./components/activitylog');
const { router: dashboardRoutes } = require('./components/dashboard');
const { router: paymentRoutes } = require('./components/payment');
const { router: chatRoutes } = require('./components/chat');
const { startSepayOrderExpiryJob } = require('./services/sepayOrderExpiry');

// Táº¡o app + http server + socket.io
const app = express();
app.set('trust proxy', 1);
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.ADDRESS, // Láº¥y Ä‘á»™ng URL Cloudflare Tunnel tá»« file .env
  'https://Nova.com.vn',
  'https://irelia.online',
  'https://ecom.irelia.online',
  'http://irelia.online',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
].filter(Boolean);

const checkOrigin = (origin, callback) => {
  if (
    process.env.NODE_ENV === 'development' ||
    !origin ||
    allowedOrigins.includes(origin) ||
    (process.env.NODE_ENV !== 'production' && origin.startsWith('http://192.168.')) // Cho phÃ©p IP LAN khi khÃ´ng á»Ÿ production
  ) {
    callback(null, true);
  } else {
    callback(null, false); // Tráº£ vá» false thay vÃ¬ nÃ©m lá»—i gÃ¢y crash 500
  }
};

// Khá»Ÿi táº¡o Socket.IO
const io = new Server(server, {
  cors: {
    origin: checkOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

const parseCookieHeader = (cookieHeader = '') => {
  return cookieHeader.split(';').reduce((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName || rawValue.length === 0) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join('='));
    return cookies;
  }, {});
};

io.use(async (socket, next) => {
  try {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie || '');
    const token = cookies.authToken;
    if (!token) {
      return next(new Error('unauthorized'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || !['superadmin', 'admin', 'staff'].includes(user.role)) {
      return next(new Error('unauthorized'));
    }

    socket.data.user = {
      id: user._id.toString(),
      role: user.role,
      phone: user.phone,
    };
    next();
  } catch (error) {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.join('admins');
  console.log('Socket connected:', socket.id);

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected (${socket.id}): ${reason}`);
  });
});


// LÆ°u io vÃ o app Ä‘á»ƒ cÃ¡c route khÃ¡c (chá»‰ `order.js`) dÃ¹ng Ä‘Æ°á»£c
app.set('io', io);

// Middleware
app.use(express.json());
app.use(cookieParser());

const corsOptions = {
  origin: checkOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'CSRF-Token'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet({
  hsts: false,
  contentSecurityPolicy: false
}));

// TiÃªu Ä‘á» Cross-Origin-Resource-Policy
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// Routes
app.use('/users', userRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes); // <== chá»‰ route nÃ y cÃ³ thá»ƒ dÃ¹ng io.emit()
app.use('/chips', chipRoutes);
app.use('/chips/types', chipTypeRoutes);
app.use('/carts', cartRoutes);
app.use('/manages', manageRoutes);
app.use('/iporders', iporderRoutes);
app.use('/eporders', eporderRoutes);
app.use('/histories', historyRoutes);
app.use('/activity-logs', activityLogRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/payments', paymentRoutes);
app.use('/chat', chatRoutes);

// Static files
const fs = require('fs');
const uploadInvoicesDir = path.join(__dirname, 'upload', 'invoices');
const uploadDocumentsDir = path.join(__dirname, 'upload', 'documents');
if (!fs.existsSync(uploadInvoicesDir)) {
  fs.mkdirSync(uploadInvoicesDir, { recursive: true });
}
if (!fs.existsSync(uploadDocumentsDir)) {
  fs.mkdirSync(uploadDocumentsDir, { recursive: true });
}

app.use('/images', express.static(path.join(__dirname, 'upload', 'images')));
app.use('/documents', express.static(uploadDocumentsDir));
app.use('/section-images', express.static(path.join(__dirname, 'upload', 'sections')));
app.use('/invoice-images', authenticateAdmin, express.static(uploadInvoicesDir));

// Serve admin dashboard static files
const adminDistPath = path.join(__dirname, '../ad/dist');
app.use('/admin', express.static(adminDistPath));

app.get('/admin/*', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(adminDistPath, 'index.html'));
});

// Serve customer frontend static files
const feBuildPath = path.join(__dirname, '../fe/build');
app.use(express.static(feBuildPath));

// Fallback for React Router on customer website (exclude API endpoints)
app.get('*', (req, res, next) => {
  const apiPaths = [
    '/users', '/products', '/orders', '/chips', '/carts',
    '/manages', '/iporders', '/eporders',
    '/histories', '/activity-logs', '/dashboard', '/payments', '/chat',
    '/images', '/documents', '/section-images'
  ];
  const isApi = apiPaths.some(path => req.path.startsWith(path));
  const isStaticFile = /\.(jpg|jpeg|png|gif|webp|pdf|svg|css|js|ico|map)$/i.test(req.path);

  if (isApi || isStaticFile) {
    return next();
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(feBuildPath, 'index.html'));
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  if (err?.status === 400 && err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }

  console.error('Server error:', err.message);
  return res.status(500).json({ message: 'Internal server error' });
});

const startServer = async () => {
  const PORT = process.env.PORT || 5000;
  const mongoUri = resolveMongoUri();

  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB database: ${mongoose.connection.name}`);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, () => {
      server.removeListener('error', reject);
      console.log(`Server running on port ${PORT}`);
      startSepayOrderExpiryJob({ io });
      resolve(server);
    });
  });
};

// Start server with socket only after the database is ready.
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  });
}

module.exports = app;
module.exports.startServer = startServer;

