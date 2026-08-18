const { Asset, AssetAllocation, User, Location, Ticket, SoftwareLicense, AuditLog, ReportSchedule, sequelize } = require('../models');
const { Op } = require('sequelize');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');
const { sendEmail } = require('../utils/mail');

/**
 * Watermark helper for PDF reports — draws the watermark image at 45 degrees
 */
function drawWatermark(doc, watermarkPath) {
  // Snapshot cursor and margins before any drawing
  const savedX = doc.x;
  const savedY = doc.y;
  const oldTopMargin = doc.page.margins.top;
  const oldBottomMargin = doc.page.margins.bottom;

  doc.save();
  
  // Suppress all margins to prevent recursive page breaks
  doc.page.margins.top = 0;
  doc.page.margins.bottom = 0;
  
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const cx = pageW / 2;
  const cy = pageH / 2;
  
  // Watermark covers ~65% of page width
  const wmWidth = pageW * 0.65;
  
  try {
    doc.opacity(0.20);
    // Rotate -45 degrees around the page center
    doc.rotate(-45, { origin: [cx, cy] });
    // Center image on page
    doc.image(watermarkPath, cx - wmWidth / 2, cy - wmWidth * 0.18, { width: wmWidth });
  } catch (e) {
    // Fallback: diagonal text
    doc.opacity(0.10);
    doc.fontSize(65).font('Helvetica-Bold').fillColor('#94A3B8');
    doc.rotate(-45, { origin: [cx, cy] });
    doc.text('CONFIDENTIAL', cx - 220, cy - 35, { width: 440, align: 'center' });
  }
  
  doc.restore();

  // Restore margins and cursor
  doc.page.margins.top = oldTopMargin;
  doc.page.margins.bottom = oldBottomMargin;
  doc.x = savedX;
  doc.y = savedY;
}

/**
 * Footer helper for PDF reports (Powered by section with logo)
 */
function drawFooter(doc, logoPath) {
  // Snapshot cursor and margins before any drawing
  const savedX = doc.x;
  const savedY = doc.y;
  const oldBottomMargin = doc.page.margins.bottom;

  doc.save();

  // Suppress bottom margin to prevent recursive page breaks
  doc.page.margins.bottom = 0;
  
  const footerY = doc.page.height - 45;
  
  // Subtle divider line
  doc.opacity(1);
  doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(30, footerY).lineTo(doc.page.width - 30, footerY).stroke();
  
  // "Powered by" label
  doc.fontSize(8).fillColor('#64748b').font('Helvetica');
  doc.text('Powered by', doc.page.width - 200, footerY + 13, { width: 85, align: 'right' });
  
  // Logo image
  try {
    doc.image(logoPath, doc.page.width - 110, footerY + 10, { height: 14 });
  } catch (err) {
    doc.text('AssetIQ', doc.page.width - 108, footerY + 13, { width: 80, align: 'left' });
  }
  
  doc.restore();

  // Restore margins and cursor
  doc.page.margins.bottom = oldBottomMargin;
  doc.x = savedX;
  doc.y = savedY;
}

/**
 * Helper to generate table layout in PDFKit landscape document
 */
function generatePdfReport(reportTitle, headers, data, res) {
  const doc = new PDFDocument({ layout: 'landscape', margin: 30 });
  const logoPath = path.join(__dirname, '../assets/logo.png');
  const watermarkPath = path.join(__dirname, '../assets/watermark.png');
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${reportTitle.toLowerCase().replace(/ /g, '_')}.pdf"`);
  
  doc.pipe(res);
  
  let isDrawingDecorations = false;
  const decoratePage = () => {
    if (isDrawingDecorations) return;
    isDrawingDecorations = true;
    drawWatermark(doc, watermarkPath);
    drawFooter(doc, logoPath);
    isDrawingDecorations = false;
  };
  
  // Register pageAdded listener to automatically draw watermarks and footers on new pages
  doc.on('pageAdded', () => {
    decoratePage();
    // Explicitly reset cursor to top-left after decorating a new page
    doc.x = doc.page.margins.left;
    doc.y = doc.page.margins.top;
  });
  
  // Draw on the first page immediately, then reset cursor to top margin for content
  decoratePage();
  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;
  
  // Title
  doc.fontSize(18).fillColor('#10b981').text(reportTitle, { align: 'left' });
  doc.fontSize(10).fillColor('#64748b').text(`Generated on: ${new Date().toLocaleString()} | Total Records: ${data.length}`, { align: 'left' });
  doc.moveDown(1.5);
  
  const startX = 30;
  let startY = doc.y;
  
  const pageWidth = doc.page.width - 60; // 792 - 60 = 732
  const colCount = headers.length;
  const colWidth = pageWidth / colCount;
  
  // Header Row
  doc.rect(startX, startY, pageWidth, 20).fill('#10b981');
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  headers.forEach((header, index) => {
    doc.text(header, startX + (index * colWidth) + 5, startY + 5, {
      width: colWidth - 10,
      align: 'left',
      ellipsis: true
    });
  });
  
  startY += 20;
  doc.font('Helvetica').fillColor('#334155');
  
  // Rows
  data.forEach((row, rowIndex) => {
    // Page breaking check: keep it above the footer line (height - 60)
    if (startY + 20 > doc.page.height - 60) {
      doc.addPage({ layout: 'landscape', margin: 30 });
      startY = 30;
      
      // Header again
      doc.rect(startX, startY, pageWidth, 20).fill('#10b981');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      headers.forEach((header, index) => {
        doc.text(header, startX + (index * colWidth) + 5, startY + 5, {
          width: colWidth - 10,
          align: 'left',
          ellipsis: true
        });
      });
      startY += 20;
      doc.font('Helvetica').fillColor('#334155');
    }
    
    // Zebra striping
    if (rowIndex % 2 === 1) {
      doc.rect(startX, startY, pageWidth, 20).fill('#f8fafc');
    }
    
    // Underline row
    doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(startX, startY + 20).lineTo(startX + pageWidth, startY + 20).stroke();
    
    // Draw columns
    doc.fillColor('#334155').fontSize(7.5);
    row.forEach((cell, cellIndex) => {
      const textVal = cell !== null && cell !== undefined ? String(cell) : '—';
      doc.text(textVal, startX + (cellIndex * colWidth) + 5, startY + 6, {
        width: colWidth - 10,
        align: 'left',
        ellipsis: true
      });
    });
    
    startY += 20;
  });
  
  doc.end();
}

/**
 * Raw Data Helper: Asset Inventory
 */
async function getInventoryDataHelper(user, body) {
  const isLocationAdmin = user.role_name === 'Location Admin';
  const isRegularUser = user.role_name === 'User';
  const myLocId = user.location_id;
  const myUserId = user.id;

  const paginate = body.paginate !== false;
  const page = parseInt(body.page) || 1;
  const limit = Math.min(parseInt(body.limit) || 10, 200);
  const offset = (page - 1) * limit;

  const { search, location_id, type, status, startDate, endDate } = body;

  let queryOptions = {
    include: [
      { model: Location, as: 'location' },
      {
        model: AssetAllocation,
        as: 'allocations',
        where: { status: 'active' },
        required: false,
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
      }
    ],
    order: [['asset_tag', 'ASC']]
  };

  const whereClause = {};

  if (isRegularUser) {
    whereClause['$allocations.user_id$'] = myUserId;
    queryOptions.include[1].required = true;
  } else if (isLocationAdmin) {
    whereClause.location_id = myLocId;
  } else if (location_id) {
    whereClause.location_id = location_id;
  }

  if (type) {
    whereClause.type = type;
  }

  if (status) {
    whereClause.status = status;
  }

  if (search) {
    whereClause[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { asset_tag: { [Op.like]: `%${search}%` } },
      { brand: { [Op.like]: `%${search}%` } },
      { serial_number: { [Op.like]: `%${search}%` } }
    ];
  }

  if (startDate || endDate) {
    whereClause.created_at = {};
    if (startDate) whereClause.created_at[Op.gte] = new Date(startDate);
    if (endDate) whereClause.created_at[Op.lte] = new Date(endDate + 'T23:59:59');
  }

  queryOptions.where = whereClause;
  queryOptions.distinct = true;

  let assets, total;
  if (paginate) {
    queryOptions.limit = limit;
    queryOptions.offset = offset;
    const result = await Asset.findAndCountAll(queryOptions);
    assets = result.rows;
    total = result.count;
  } else {
    assets = await Asset.findAll(queryOptions);
    total = assets.length;
  }

  // Calculate summary metrics for all assets matching filter criteria
  const allMatchingForMetrics = await Asset.findAll({
    where: whereClause,
    attributes: ['id', 'status', 'type'],
    include: isRegularUser ? queryOptions.include : []
  });

  const totalAssetsCount = allMatchingForMetrics.length;
  const availableAssetsCount = allMatchingForMetrics.filter(a => a.status === 'available').length;
  const allocatedAssetsCount = allMatchingForMetrics.filter(a => a.status === 'allocated').length;
  const maintenanceAssetsCount = allMatchingForMetrics.filter(a => a.status === 'maintenance').length;

  const typeMap = {};
  allMatchingForMetrics.forEach(a => {
    if (a.type) typeMap[a.type] = (typeMap[a.type] || 0) + 1;
  });
  const typeBreakdownData = Object.keys(typeMap).map(key => ({
    name: key,
    value: typeMap[key]
  }));

  const summary = {
    totalAssetsCount,
    availableAssetsCount,
    allocatedAssetsCount,
    maintenanceAssetsCount,
    typeBreakdownData
  };

  const flattedAssets = assets.map(a => {
    const activeAllocation = a.allocations && a.allocations[0];
    return {
      ...a.toJSON(),
      allocated_user_name: activeAllocation && activeAllocation.user ? activeAllocation.user.name : null,
      allocated_user_id: activeAllocation && activeAllocation.user ? activeAllocation.user.id : null
    };
  });

  let locations = [];
  if (isLocationAdmin) {
    locations = await Location.findAll({ where: { id: myLocId } });
  } else {
    locations = await Location.findAll({ order: [['name', 'ASC']] });
  }

  return { assets: flattedAssets, locations, total, summary };
}

/**
 * Raw Data Helper: Asset Allocations
 */
async function getAllocationDataHelper(user, body) {
  const isLocationAdmin = user.role_name === 'Location Admin';
  const isRegularUser = user.role_name === 'User';
  const myLocId = user.location_id;
  const myUserId = user.id;

  const paginate = body.paginate !== false;
  const page = parseInt(body.page) || 1;
  const limit = Math.min(parseInt(body.limit) || 10, 200);
  const offset = (page - 1) * limit;

  const { search, status, startDate, endDate, location_id } = body;

  const allocationWhere = {};
  const assetWhere = {};

  if (isRegularUser) {
    allocationWhere.user_id = myUserId;
  } else if (isLocationAdmin) {
    assetWhere.location_id = myLocId;
  } else if (location_id) {
    assetWhere.location_id = location_id;
  }

  if (status) {
    allocationWhere.status = status;
  }

  if (startDate || endDate) {
    allocationWhere.allocated_at = {};
    if (startDate) allocationWhere.allocated_at[Op.gte] = new Date(startDate);
    if (endDate) allocationWhere.allocated_at[Op.lte] = new Date(endDate + 'T23:59:59');
  }

  if (search) {
    allocationWhere[Op.or] = [
      { notes: { [Op.like]: `%${search}%` } },
      { '$asset.asset_tag$': { [Op.like]: `%${search}%` } },
      { '$asset.name$': { [Op.like]: `%${search}%` } },
      { '$user.name$': { [Op.like]: `%${search}%` } },
      { '$allocator.name$': { [Op.like]: `%${search}%` } }
    ];
  }

  const queryOptions = {
    where: allocationWhere,
    distinct: true,
    include: [
      {
        model: Asset,
        as: 'asset',
        where: assetWhere,
        required: isLocationAdmin || !!location_id || (search && (search.includes('AST-') || search.includes('AST')))
      },
      {
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      },
      {
        model: User,
        as: 'allocator',
        attributes: ['id', 'name', 'email']
      }
    ],
    order: [['id', 'DESC']]
  };

  let allocations, total;
  if (paginate) {
    queryOptions.limit = limit;
    queryOptions.offset = offset;
    const result = await AssetAllocation.findAndCountAll(queryOptions);
    allocations = result.rows;
    total = result.count;
  } else {
    allocations = await AssetAllocation.findAll(queryOptions);
    total = allocations.length;
  }

  const summary = { total };

  return { allocations, total, summary };
}

/**
 * Raw Data Helper: Tickets
 */
async function getTicketDataHelper(user, body) {
  const isLocationAdmin = user.role_name === 'Location Admin';
  const isRegularUser = user.role_name === 'User';
  const myLocId = user.location_id;
  const myUserId = user.id;

  const paginate = body.paginate !== false;
  const page = parseInt(body.page) || 1;
  const limit = Math.min(parseInt(body.limit) || 10, 200);
  const offset = (page - 1) * limit;

  const { search, category, priority, status, location_id, startDate, endDate } = body;

  const whereClause = {};

  if (isRegularUser) {
    whereClause.user_id = myUserId;
  } else if (isLocationAdmin) {
    whereClause.location_id = myLocId;
  } else if (location_id) {
    whereClause.location_id = location_id;
  }

  if (category) whereClause.category = category;
  if (priority) whereClause.priority = priority;
  if (status) whereClause.status = status;

  if (startDate || endDate) {
    whereClause.created_at = {};
    if (startDate) whereClause.created_at[Op.gte] = new Date(startDate);
    if (endDate) whereClause.created_at[Op.lte] = new Date(endDate + 'T23:59:59');
  }

  if (search) {
    whereClause[Op.or] = [
      { ticket_no: { [Op.like]: `%${search}%` } },
      { title: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
      { '$reporter.name$': { [Op.like]: `%${search}%` } },
      { '$assignee.name$': { [Op.like]: `%${search}%` } }
    ];
  }

  const queryOptions = {
    where: whereClause,
    distinct: true,
    include: [
      { model: Location, as: 'location', attributes: ['id', 'name'] },
      { model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'name', 'type'] },
      { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
      { model: User, as: 'reporter', attributes: ['id', 'name', 'email'] },
      { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }
    ],
    order: [['created_at', 'DESC']]
  };

  let tickets, total;
  if (paginate) {
    queryOptions.limit = limit;
    queryOptions.offset = offset;
    const result = await Ticket.findAndCountAll(queryOptions);
    tickets = result.rows;
    total = result.count;
  } else {
    tickets = await Ticket.findAll(queryOptions);
    total = tickets.length;
  }

  // Calculate summary metrics for tickets matching filter criteria
  const allMatchingForMetrics = await Ticket.findAll({
    where: whereClause,
    attributes: ['id', 'status', 'priority']
  });

  const totalTicketsCount = allMatchingForMetrics.length;
  const pendingTicketsCount = allMatchingForMetrics.filter(t => t.status === 'pending').length;
  const progressTicketsCount = allMatchingForMetrics.filter(t => t.status === 'in_progress').length;
  const resolvedTicketsCount = allMatchingForMetrics.filter(t => t.status === 'resolved').length;
  const closedTicketsCount = allMatchingForMetrics.filter(t => t.status === 'closed').length;
  const cancelledTicketsCount = allMatchingForMetrics.filter(t => t.status === 'cancelled').length;

  const ticketPriorityMap = {};
  allMatchingForMetrics.forEach(t => {
    if (t.priority) {
      ticketPriorityMap[t.priority] = (ticketPriorityMap[t.priority] || 0) + 1;
    }
  });

  const summary = {
    totalTicketsCount,
    pendingTicketsCount,
    progressTicketsCount,
    resolvedTicketsCount,
    closedTicketsCount,
    cancelledTicketsCount,
    ticketPriorityMap
  };

  let locations = [];
  if (isLocationAdmin) {
    locations = await Location.findAll({ where: { id: myLocId } });
  } else {
    locations = await Location.findAll({ order: [['name', 'ASC']] });
  }

  return { tickets, locations, total, summary };
}

/**
 * Raw Data Helper: Software Licenses
 */
async function getLicenseDataHelper(user, body) {
  const isLocationAdmin = user.role_name === 'Location Admin';
  const isRegularUser = user.role_name === 'User';
  const myLocId = user.location_id;
  const myUserId = user.id;

  const paginate = body.paginate !== false;
  const page = parseInt(body.page) || 1;
  const limit = Math.min(parseInt(body.limit) || 10, 200);
  const offset = (page - 1) * limit;

  const { search, status, startDate, endDate, location_id } = body;

  const whereClause = {};

  if (isRegularUser) {
    whereClause.assigned_user_id = myUserId;
  } else if (isLocationAdmin) {
    const localUserIds = (await User.findAll({
      where: { location_id: myLocId },
      attributes: ['id']
    })).map(u => u.id);
    whereClause.assigned_user_id = localUserIds;
  } else if (location_id) {
    const targetUserIds = (await User.findAll({
      where: { location_id },
      attributes: ['id']
    })).map(u => u.id);
    whereClause.assigned_user_id = targetUserIds;
  }

  if (status) whereClause.status = status;

  if (startDate || endDate) {
    whereClause.valid_until = {};
    if (startDate) whereClause.valid_until[Op.gte] = startDate;
    if (endDate) whereClause.valid_until[Op.lte] = endDate;
  }

  if (search) {
    whereClause[Op.or] = [
      { software_name: { [Op.like]: `%${search}%` } },
      { license_key: { [Op.like]: `%${search}%` } },
      { '$user.name$': { [Op.like]: `%${search}%` } }
    ];
  }

  const queryOptions = {
    where: whereClause,
    distinct: true,
    subQuery: false,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'location_id'],
        include: [{ model: Location, as: 'location', attributes: ['id', 'name'] }]
      }
    ],
    order: [['created_at', 'DESC']]
  };

  let licenses, total;
  if (paginate) {
    queryOptions.limit = limit;
    queryOptions.offset = offset;
    const result = await SoftwareLicense.findAndCountAll(queryOptions);
    licenses = result.rows;
    total = result.count;
  } else {
    licenses = await SoftwareLicense.findAll(queryOptions);
    total = licenses.length;
  }

  // Calculate summary metrics for licenses matching filter criteria
  const allMatchingForMetrics = await SoftwareLicense.findAll({
    where: whereClause,
    attributes: ['id', 'status', 'software_name'],
    include: queryOptions.include,
    subQuery: false
  });

  const totalLicensesCount = allMatchingForMetrics.length;
  const activeLicensesCount = allMatchingForMetrics.filter(l => l.status === 'active').length;
  const availableLicensesCount = allMatchingForMetrics.filter(l => l.status === 'available').length;
  const expiredLicensesCount = allMatchingForMetrics.filter(l => l.status === 'expired').length;

  const licenseSoftwareMap = {};
  allMatchingForMetrics.forEach(l => {
    const softName = l.software_name || 'Unknown Software';
    licenseSoftwareMap[softName] = (licenseSoftwareMap[softName] || 0) + 1;
  });

  const summary = {
    totalLicensesCount,
    activeLicensesCount,
    availableLicensesCount,
    expiredLicensesCount,
    licenseSoftwareMap
  };

  return { licenses, total, summary };
}

/**
 * Raw Data Helper: Audit Trail Logs
 */
async function getAuditDataHelper(user, body) {
  const isLocationAdmin = user.role_name === 'Location Admin';
  const isRegularUser = user.role_name === 'User';
  const myLocId = user.location_id;
  const myUserId = user.id;

  const paginate = body.paginate !== false;
  const page = parseInt(body.page) || 1;
  const limit = Math.min(parseInt(body.limit) || 10, 200);
  const offset = (page - 1) * limit;

  const { search, action, startDate, endDate } = body;

  const whereClause = {};

  if (isRegularUser) {
    whereClause.user_id = myUserId;
  } else if (isLocationAdmin) {
    const localUserIds = (await User.findAll({
      where: { location_id: myLocId },
      attributes: ['id']
    })).map(u => u.id);
    whereClause.user_id = localUserIds;
  }

  if (action) {
    whereClause.action = { [Op.like]: `%${action}%` };
  }

  if (startDate || endDate) {
    whereClause.created_at = {};
    if (startDate) whereClause.created_at[Op.gte] = new Date(startDate);
    if (endDate) whereClause.created_at[Op.lte] = new Date(endDate + 'T23:59:59');
  }

  if (search) {
    whereClause[Op.or] = [
      { action: { [Op.like]: `%${search}%` } },
      { details: { [Op.like]: `%${search}%` } },
      { '$user.name$': { [Op.like]: `%${search}%` } }
    ];
  }

  const queryOptions = {
    where: whereClause,
    distinct: true,
    subQuery: false,
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email'] }
    ],
    order: [['created_at', 'DESC']]
  };

  let logs, total;
  if (paginate) {
    queryOptions.limit = limit;
    queryOptions.offset = offset;
    const result = await AuditLog.findAndCountAll(queryOptions);
    logs = result.rows;
    total = result.count;
  } else {
    logs = await AuditLog.findAll(queryOptions);
    total = logs.length;
  }

  const summary = { total };

  return { logs, total, summary };
}

/**
 * Controller: Get Asset Inventory Report
 */
async function getInventoryReport(req, res) {
  try {
    const data = await getInventoryDataHelper(req.user, req.body);
    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    
    return res.json({
      success: true,
      assets: data.assets,
      locations: data.locations,
      summary: data.summary,
      pagination: paginate ? {
        page,
        limit,
        total: data.total,
        totalPages: Math.ceil(data.total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating inventory report:', error);
    return res.status(500).json({ error: 'Database error generating asset inventory report.' });
  }
}

/**
 * Controller: Get Asset In/Out Allocations Report
 */
async function getAllocationReport(req, res) {
  try {
    const data = await getAllocationDataHelper(req.user, req.body);
    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    
    return res.json({
      success: true,
      allocations: data.allocations,
      summary: data.summary,
      pagination: paginate ? {
        page,
        limit,
        total: data.total,
        totalPages: Math.ceil(data.total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating allocation report:', error);
    return res.status(500).json({ error: 'Database error generating asset allocation report.' });
  }
}

/**
 * Controller: Get Tickets Support Report
 */
async function getTicketReport(req, res) {
  try {
    const data = await getTicketDataHelper(req.user, req.body);
    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;

    return res.json({
      success: true,
      tickets: data.tickets,
      locations: data.locations,
      summary: data.summary,
      pagination: paginate ? {
        page,
        limit,
        total: data.total,
        totalPages: Math.ceil(data.total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating ticket report:', error);
    return res.status(500).json({ error: 'Database error generating ticket report.' });
  }
}

/**
 * Controller: Get Software License Report
 */
async function getLicenseReport(req, res) {
  try {
    const data = await getLicenseDataHelper(req.user, req.body);
    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;

    return res.json({
      success: true,
      licenses: data.licenses,
      summary: data.summary,
      pagination: paginate ? {
        page,
        limit,
        total: data.total,
        totalPages: Math.ceil(data.total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating license report:', error);
    return res.status(500).json({ error: 'Database error generating software license report.' });
  }
}

/**
 * Controller: Get Audit Trail Report
 */
async function getAuditReport(req, res) {
  try {
    const data = await getAuditDataHelper(req.user, req.body);
    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;

    return res.json({
      success: true,
      logs: data.logs,
      summary: data.summary,
      pagination: paginate ? {
        page,
        limit,
        total: data.total,
        totalPages: Math.ceil(data.total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating audit report:', error);
    return res.status(500).json({ error: 'Database error generating audit report.' });
  }
}

/**
 * Controller: Export Report to Excel/PDF
 */
async function exportReport(req, res) {
  try {
    const { reportType, format } = req.body;
    if (!['inventory', 'allocations', 'tickets', 'licenses', 'audit-logs', 'custom'].includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type.' });
    }
    if (!['excel', 'pdf', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Supported formats are excel, pdf, and csv.' });
    }

    // Force paginate to false for raw data export
    const queryBody = { ...req.body, paginate: false };

    let reportTitle = '';
    let headers = [];
    let data = [];

    if (reportType === 'custom') {
      reportTitle = req.body.reportName || 'Custom Report';
      headers = req.body.headers || [];
      data = req.body.data || [];
    } else if (reportType === 'inventory') {
      const result = await getInventoryDataHelper(req.user, queryBody);
      reportTitle = 'Asset Inventory Report';
      headers = ['Asset Tag', 'Name', 'Type', 'Brand', 'Serial Number', 'Location', 'Status', 'Assigned To'];
      data = result.assets.map(a => [
        a.asset_tag,
        a.name,
        a.type,
        a.brand || '—',
        a.serial_number || '—',
        a.location ? a.location.name : '—',
        a.status ? a.status.toUpperCase() : '—',
        a.allocated_user_name || '—'
      ]);
    } else if (reportType === 'allocations') {
      const result = await getAllocationDataHelper(req.user, queryBody);
      reportTitle = 'Asset In-Out Report';
      headers = ['Asset Tag', 'Allocated To', 'Allocated By', 'Notes', 'Status', 'Allocation Date', 'Return Date'];
      data = result.allocations.map(a => [
        a.asset ? a.asset.asset_tag : '—',
        a.user ? a.user.name : '—',
        a.allocator ? a.allocator.name : '—',
        a.notes || '—',
        a.status ? a.status.toUpperCase() : '—',
        a.created_at ? new Date(a.created_at).toLocaleDateString() : '—',
        a.returned_at ? new Date(a.returned_at).toLocaleDateString() : '—'
      ]);
    } else if (reportType === 'tickets') {
      const result = await getTicketDataHelper(req.user, queryBody);
      reportTitle = 'Tickets Support Report';
      headers = ['Ticket No', 'Title', 'Category', 'Priority', 'Status', 'Raised By', 'Assignee', 'Created Date'];
      const CATEGORY_LABELS = {
        hardware_malfunction: 'Hardware Malfunction',
        software_issue: 'Software Issue',
        lost_stolen: 'Lost / Stolen',
        physical_damage: 'Physical Damage',
        general_it: 'General IT'
      };
      const PRIORITY_LABELS = {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        critical: 'Critical'
      };
      data = result.tickets.map(tkt => [
        tkt.ticket_no,
        tkt.title,
        CATEGORY_LABELS[tkt.category] || (tkt.category ? tkt.category.toUpperCase() : '—'),
        PRIORITY_LABELS[tkt.priority] || (tkt.priority ? tkt.priority.toUpperCase() : '—'),
        tkt.status ? tkt.status.toUpperCase() : '—',
        tkt.reporter ? tkt.reporter.name : '—',
        tkt.assignee ? tkt.assignee.name : '—',
        tkt.created_at ? new Date(tkt.created_at).toLocaleDateString() : '—'
      ]);
    } else if (reportType === 'licenses') {
      const result = await getLicenseDataHelper(req.user, queryBody);
      reportTitle = 'Software License Report';
      headers = ['Software Name', 'License Key', 'Assigned To', 'Valid From', 'Valid Until', 'Status'];
      data = result.licenses.map(l => [
        l.software_name,
        l.license_key,
        l.user ? l.user.name : '—',
        l.valid_from || '—',
        l.valid_until || 'Perpetual',
        l.status ? l.status.toUpperCase() : '—'
      ]);
    } else if (reportType === 'audit-logs') {
      const result = await getAuditDataHelper(req.user, queryBody);
      reportTitle = 'System Audit Trail Report';
      headers = ['Timestamp', 'Performed By', 'Action', 'Details'];
      data = result.logs.map(l => [
        l.created_at ? new Date(l.created_at).toLocaleString() : '—',
        l.user ? l.user.name : 'System',
        l.action,
        l.details
      ]);
    }

    if (format === 'excel') {
      const watermarkPath = path.join(__dirname, '../assets/watermark.png');
      const logoPath = path.join(__dirname, '../assets/logo.png');

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AssetIQ';
      const worksheet = workbook.addWorksheet('Report', {
        pageSetup: { fitToPage: true, fitToWidth: 1 }
      });

      // --- Background watermark image (rotated 45 degrees via Jimp) ---
      try {
        if (fs.existsSync(watermarkPath)) {
          // Rotate the watermark 45 degrees with transparent padding so nothing is clipped
          const jimpImg = await Jimp.read(watermarkPath);
          const maxDim = Math.max(jimpImg.bitmap.width, jimpImg.bitmap.height);
          const paddedSize = Math.ceil(maxDim * 1.5);
          const paddedImg = new Jimp({ width: paddedSize, height: paddedSize, color: 0x00000000 });
          paddedImg.composite(jimpImg, (paddedSize - jimpImg.bitmap.width) / 2, (paddedSize - jimpImg.bitmap.height) / 2);
          paddedImg.rotate(45);
          paddedImg.opacity(0.25);
          const rotatedBuffer = await paddedImg.getBuffer('image/png');
          const wmId = workbook.addImage({ buffer: rotatedBuffer, extension: 'png' });
          worksheet.addBackgroundImage(wmId);
        }
      } catch (wmErr) {
        console.warn('[EXCEL WATERMARK] Could not add background image:', wmErr.message);
      }

      // --- Header row ---
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FF059669' } }
        };
      });
      headerRow.height = 22;

      // --- Data rows ---
      data.forEach((row, rowIndex) => {
        const excelRow = worksheet.addRow(row);
        const isEven = rowIndex % 2 === 0;
        excelRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
          cell.font = { size: 10, color: { argb: 'FF334155' } };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
        });
        excelRow.height = 18;
      });

      // --- Auto column widths ---
      worksheet.columns.forEach((col, idx) => {
        let maxLen = headers[idx] ? String(headers[idx]).length : 10;
        data.forEach(row => {
          const val = row[idx] !== null && row[idx] !== undefined ? String(row[idx]) : '';
          if (val.length > maxLen) maxLen = val.length;
        });
        col.width = Math.min(Math.max(maxLen + 4, 12), 45);
      });

      // --- Blank spacer + branding footer ---
      worksheet.addRow([]);
      const brandRow = worksheet.addRow([`© ${new Date().getFullYear()} AssetIQ — Confidential. Powered by AssetIQ.`]);
      brandRow.getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' }, size: 9 };

      // --- "Powered by" logo image in the footer area (column after last header) ---
      try {
        if (fs.existsSync(logoPath)) {
          const logoId = workbook.addImage({ filename: logoPath, extension: 'png' });
          const lastDataRow = data.length + 3; // header(1) + data + spacer(1) + brand(1)
          worksheet.addImage(logoId, {
            tl: { col: headers.length, row: lastDataRow - 1 },
            ext: { width: 90, height: 22 }
          });
        }
      } catch (logoErr) {
        console.warn('[EXCEL LOGO] Could not add logo image:', logoErr.message);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${reportTitle.toLowerCase().replace(/ /g, '_')}.xlsx"`);
      return res.send(buffer);
    } else if (format === 'pdf') {
      return generatePdfReport(reportTitle, headers, data, res);
    } else if (format === 'csv') {
      const sheetData = [
        headers,
        ...data,
        [],
        ['© AssetIQ — Confidential. Powered by AssetIQ.']
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const csvString = XLSX.utils.sheet_to_csv(worksheet);
      const buffer = Buffer.from(csvString, 'utf-8');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${reportTitle.toLowerCase().replace(/ /g, '_')}.csv"`);
      return res.send(buffer);
    }
  } catch (error) {
    console.error('Error exporting report:', error);
    return res.status(500).json({ error: 'Server error generating export file.' });
  }
}

module.exports = {
  getInventoryReport,
  getAllocationReport,
  getTicketReport,
  getLicenseReport,
  getAuditReport,
  exportReport,
  sendReportEmail,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  runSchedule,
  checkAndRunScheduledReports
};

/**
 * Helper to generate table layout in PDFKit landscape document returning a Buffer Promise
 */
function generatePdfReportBuffer(reportTitle, headers, data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ layout: 'landscape', margin: 30 });
      const logoPath = path.join(__dirname, '../assets/logo.png');
      const watermarkPath = path.join(__dirname, '../assets/watermark.png');
      
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));
      
      let isDrawingDecorations = false;
      const decoratePage = () => {
        if (isDrawingDecorations) return;
        isDrawingDecorations = true;
        drawWatermark(doc, watermarkPath);
        drawFooter(doc, logoPath);
        isDrawingDecorations = false;
      };
      
      doc.on('pageAdded', () => {
        decoratePage();
        doc.x = doc.page.margins.left;
        doc.y = doc.page.margins.top;
      });
      
      decoratePage();
      doc.x = doc.page.margins.left;
      doc.y = doc.page.margins.top;
      
      doc.fontSize(18).fillColor('#10b981').text(reportTitle, { align: 'left' });
      doc.fontSize(10).fillColor('#64748b').text(`Generated on: ${new Date().toLocaleString()} | Total Records: ${data.length}`, { align: 'left' });
      doc.moveDown(1.5);
      
      const startX = 30;
      let startY = doc.y;
      
      const pageWidth = doc.page.width - 60;
      const colCount = headers.length;
      const colWidth = pageWidth / colCount;
      
      doc.rect(startX, startY, pageWidth, 20).fill('#10b981');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      headers.forEach((header, index) => {
        doc.text(header, startX + (index * colWidth) + 5, startY + 5, {
          width: colWidth - 10,
          align: 'left',
          ellipsis: true
        });
      });
      
      startY += 20;
      doc.font('Helvetica').fillColor('#334155');
      
      data.forEach((row, rowIndex) => {
        if (startY + 20 > doc.page.height - 60) {
          doc.addPage({ layout: 'landscape', margin: 30 });
          startY = 30;
          
          doc.rect(startX, startY, pageWidth, 20).fill('#10b981');
          doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
          headers.forEach((header, index) => {
            doc.text(header, startX + (index * colWidth) + 5, startY + 5, {
              width: colWidth - 10,
              align: 'left',
              ellipsis: true
            });
          });
          startY += 20;
          doc.font('Helvetica').fillColor('#334155');
        }
        
        if (rowIndex % 2 === 1) {
          doc.rect(startX, startY, pageWidth, 20).fill('#f8fafc');
        }
        
        doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(startX, startY + 20).lineTo(startX + pageWidth, startY + 20).stroke();
        
        doc.fillColor('#334155').fontSize(7.5);
        row.forEach((cell, cellIndex) => {
          const textVal = cell !== null && cell !== undefined ? String(cell) : '—';
          doc.text(textVal, startX + (cellIndex * colWidth) + 5, startY + 6, {
            width: colWidth - 10,
            align: 'left',
            ellipsis: true
          });
        });
        
        startY += 20;
      });
      
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Controller: Send Report via Email
 */
async function sendReportEmail(req, res) {
  try {
    const { reportType, format, emailTo, emailNote } = req.body;
    if (!emailTo || !emailTo.trim()) {
      return res.status(400).json({ error: 'Recipient email is required.' });
    }
    if (!['inventory', 'allocations', 'tickets', 'licenses', 'audit-logs', 'custom'].includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type.' });
    }
    if (!['excel', 'pdf', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Supported formats are excel, pdf, and csv.' });
    }

    const queryBody = { ...req.body, paginate: false };

    let reportTitle = '';
    let headers = [];
    let data = [];

    if (reportType === 'custom') {
      reportTitle = req.body.reportName || 'Custom Report';
      headers = req.body.headers || [];
      data = req.body.data || [];
    } else if (reportType === 'inventory') {
      const result = await getInventoryDataHelper(req.user, queryBody);
      reportTitle = 'Asset Inventory Report';
      headers = ['Asset Tag', 'Name', 'Type', 'Brand', 'Serial Number', 'Location', 'Status', 'Assigned To'];
      data = result.assets.map(a => [
        a.asset_tag,
        a.name,
        a.type,
        a.brand || '—',
        a.serial_number || '—',
        a.location ? a.location.name : '—',
        a.status ? a.status.toUpperCase() : '—',
        a.allocated_user_name || '—'
      ]);
    } else if (reportType === 'allocations') {
      const result = await getAllocationDataHelper(req.user, queryBody);
      reportTitle = 'Asset In-Out Report';
      headers = ['Asset Tag', 'Allocated To', 'Allocated By', 'Notes', 'Status', 'Allocation Date', 'Return Date'];
      data = result.allocations.map(a => [
        a.asset ? a.asset.asset_tag : '—',
        a.user ? a.user.name : '—',
        a.allocator ? a.allocator.name : '—',
        a.notes || '—',
        a.status ? a.status.toUpperCase() : '—',
        a.created_at ? new Date(a.created_at).toLocaleDateString() : '—',
        a.returned_at ? new Date(a.returned_at).toLocaleDateString() : '—'
      ]);
    } else if (reportType === 'tickets') {
      const result = await getTicketDataHelper(req.user, queryBody);
      reportTitle = 'Tickets Support Report';
      headers = ['Ticket No', 'Title', 'Category', 'Priority', 'Status', 'Raised By', 'Assignee', 'Created Date'];
      const CATEGORY_LABELS = {
        hardware_malfunction: 'Hardware Malfunction',
        software_issue: 'Software Issue',
        lost_stolen: 'Lost / Stolen',
        physical_damage: 'Physical Damage',
        general_it: 'General IT'
      };
      const PRIORITY_LABELS = {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        critical: 'Critical'
      };
      data = result.tickets.map(tkt => [
        tkt.ticket_no,
        tkt.title,
        CATEGORY_LABELS[tkt.category] || (tkt.category ? tkt.category.toUpperCase() : '—'),
        PRIORITY_LABELS[tkt.priority] || (tkt.priority ? tkt.priority.toUpperCase() : '—'),
        tkt.status ? tkt.status.toUpperCase() : '—',
        tkt.reporter ? tkt.reporter.name : '—',
        tkt.assignee ? tkt.assignee.name : '—',
        tkt.created_at ? new Date(tkt.created_at).toLocaleDateString() : '—'
      ]);
    } else if (reportType === 'licenses') {
      const result = await getLicenseDataHelper(req.user, queryBody);
      reportTitle = 'Software License Report';
      headers = ['Software Name', 'License Key', 'Assigned To', 'Valid From', 'Valid Until', 'Status'];
      data = result.licenses.map(l => [
        l.software_name,
        l.license_key,
        l.user ? l.user.name : '—',
        l.valid_from || '—',
        l.valid_until || 'Perpetual',
        l.status ? l.status.toUpperCase() : '—'
      ]);
    } else if (reportType === 'audit-logs') {
      const result = await getAuditDataHelper(req.user, queryBody);
      reportTitle = 'System Audit Trail Report';
      headers = ['Timestamp', 'Performed By', 'Action', 'Details'];
      data = result.logs.map(l => [
        l.created_at ? new Date(l.created_at).toLocaleString() : '—',
        l.user ? l.user.name : 'System',
        l.action,
        l.details
      ]);
    }

    let buffer;
    let contentType = '';
    let ext = '';

    if (format === 'excel') {
      const watermarkPath = path.join(__dirname, '../assets/watermark.png');
      const logoPath = path.join(__dirname, '../assets/logo.png');

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AssetIQ';
      const worksheet = workbook.addWorksheet('Report', {
        pageSetup: { fitToPage: true, fitToWidth: 1 }
      });

      try {
        if (fs.existsSync(watermarkPath)) {
          const jimpImg = await Jimp.read(watermarkPath);
          const maxDim = Math.max(jimpImg.bitmap.width, jimpImg.bitmap.height);
          const paddedSize = Math.ceil(maxDim * 1.5);
          const paddedImg = new Jimp({ width: paddedSize, height: paddedSize, color: 0x00000000 });
          paddedImg.composite(jimpImg, (paddedSize - jimpImg.bitmap.width) / 2, (paddedSize - jimpImg.bitmap.height) / 2);
          paddedImg.rotate(45);
          paddedImg.opacity(0.25);
          const rotatedBuffer = await paddedImg.getBuffer('image/png');
          const wmId = workbook.addImage({ buffer: rotatedBuffer, extension: 'png' });
          worksheet.addBackgroundImage(wmId);
        }
      } catch (wmErr) {
        console.warn('[EXCEL WATERMARK] Could not add background image:', wmErr.message);
      }

      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF059669' } } };
      });
      headerRow.height = 22;

      data.forEach((row, rowIndex) => {
        const excelRow = worksheet.addRow(row);
        const isEven = rowIndex % 2 === 0;
        excelRow.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
          cell.font = { size: 10, color: { argb: 'FF334155' } };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
        });
        excelRow.height = 18;
      });

      worksheet.columns.forEach((col, idx) => {
        let maxLen = headers[idx] ? String(headers[idx]).length : 10;
        data.forEach(row => {
          const val = row[idx] !== null && row[idx] !== undefined ? String(row[idx]) : '';
          if (val.length > maxLen) maxLen = val.length;
        });
        col.width = Math.min(Math.max(maxLen + 4, 12), 45);
      });

      worksheet.addRow([]);
      const brandRow = worksheet.addRow([`© ${new Date().getFullYear()} AssetIQ — Confidential. Powered by AssetIQ.`]);
      brandRow.getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' }, size: 9 };

      try {
        if (fs.existsSync(logoPath)) {
          const logoId = workbook.addImage({ filename: logoPath, extension: 'png' });
          const lastDataRow = data.length + 3;
          worksheet.addImage(logoId, {
            tl: { col: headers.length, row: lastDataRow - 1 },
            ext: { width: 90, height: 22 }
          });
        }
      } catch (logoErr) {
        console.warn('[EXCEL LOGO] Could not add logo image:', logoErr.message);
      }

      buffer = await workbook.xlsx.writeBuffer();
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      ext = 'xlsx';
    } else if (format === 'pdf') {
      buffer = await generatePdfReportBuffer(reportTitle, headers, data);
      contentType = 'application/pdf';
      ext = 'pdf';
    } else if (format === 'csv') {
      const sheetData = [
        headers,
        ...data,
        [],
        ['© AssetIQ — Confidential. Powered by AssetIQ.']
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const csvString = XLSX.utils.sheet_to_csv(worksheet);
      buffer = Buffer.from(csvString, 'utf-8');
      contentType = 'text/csv';
      ext = 'csv';
    }

    const filename = `${reportTitle.toLowerCase().replace(/ /g, '_')}.${ext}`;
    const emailSubject = `📊 Exported Report: ${reportTitle}`;
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px;">
        <h2 style="color: #10b981; margin-top: 0;">📊 Exported Report: ${reportTitle}</h2>
        <p>Hello,</p>
        <p>Your requested custom report export has been generated successfully.</p>
        <p><strong>Report Type:</strong> ${reportTitle}</p>
        <p><strong>Format:</strong> ${format.toUpperCase()}</p>
        ${emailNote ? `<p><strong>Custom Note:</strong> ${emailNote}</p>` : ''}
        <p>Please find the exported file attached to this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b;">© ${new Date().getFullYear()} AssetIQ — Confidential. Powered by Aux AssetCare.</p>
      </div>
    `;

    const recipients = emailTo.split(',').map(email => email.trim());

    for (const recipient of recipients) {
      await sendEmail({
        to: recipient,
        subject: emailSubject,
        html: emailHtml,
        attachments: [
          {
            filename,
            content: buffer,
            contentType
          }
        ]
      });
    }

    return res.json({ success: true, message: `Report successfully sent to ${recipients.join(', ')}.` });
  } catch (error) {
    console.error('Error sending report email:', error);
    return res.status(500).json({ error: 'Server error sending report email.' });
  }
}

/**
 * Controller: List Report Schedules
 */
async function listSchedules(req, res) {
  try {
    const schedules = await ReportSchedule.findAll({
      order: [['created_at', 'DESC']]
    });
    return res.json({ success: true, schedules });
  } catch (error) {
    console.error('Error listing report schedules:', error);
    return res.status(500).json({ error: 'Database error listing report schedules.' });
  }
}

/**
 * Controller: Create Report Schedule
 */
async function createSchedule(req, res) {
  try {
    const { reportId, reportTitle, name, frequency, runTime, recipients, format, runDay, runDate } = req.body;
    if (!name || !recipients || !frequency || !runTime || !format) {
      return res.status(400).json({ error: 'Required fields missing.' });
    }

    if (frequency === 'weekly' && !runDay) {
      return res.status(400).json({ error: 'Day of week is required for weekly schedules.' });
    }
    if (frequency === 'monthly' && (runDate === undefined || runDate === null || runDate === '')) {
      return res.status(400).json({ error: 'Day of month is required for monthly schedules.' });
    }

    const newSchedule = await ReportSchedule.create({
      report_id: reportId,
      report_title: reportTitle,
      name,
      frequency,
      run_time: runTime,
      recipients,
      format,
      active: true,
      user_id: req.user ? req.user.id : null,
      run_day: frequency === 'weekly' ? runDay : null,
      run_date: frequency === 'monthly' ? parseInt(runDate, 10) : null
    });

    return res.json({ success: true, schedule: newSchedule });
  } catch (error) {
    console.error('Error creating report schedule:', error);
    return res.status(500).json({ error: 'Database error creating report schedule.' });
  }
}

/**
 * Controller: Update Report Schedule
 */
async function updateSchedule(req, res) {
  try {
    const { id } = req.params;
    const { name, frequency, runTime, recipients, format, active, runDay, runDate } = req.body;

    const schedule = await ReportSchedule.findByPk(id);
    if (!schedule) {
      return res.status(444).json({ error: 'Schedule not found.' });
    }

    if (name !== undefined) schedule.name = name;
    if (frequency !== undefined) schedule.frequency = frequency;
    if (runTime !== undefined) schedule.run_time = runTime;
    if (recipients !== undefined) schedule.recipients = recipients;
    if (format !== undefined) schedule.format = format;
    if (active !== undefined) schedule.active = active;

    const currentFreq = frequency || schedule.frequency;
    if (currentFreq === 'weekly') {
      const dayVal = runDay !== undefined ? runDay : schedule.run_day;
      if (!dayVal) {
        return res.status(400).json({ error: 'Day of week is required for weekly schedules.' });
      }
      schedule.run_day = dayVal;
      schedule.run_date = null;
    } else if (currentFreq === 'monthly') {
      const dateVal = runDate !== undefined ? runDate : schedule.run_date;
      if (dateVal === undefined || dateVal === null || dateVal === '') {
        return res.status(400).json({ error: 'Day of month is required for monthly schedules.' });
      }
      schedule.run_date = parseInt(dateVal, 10);
      schedule.run_day = null;
    } else if (currentFreq === 'daily') {
      schedule.run_day = null;
      schedule.run_date = null;
    }

    await schedule.save();

    return res.json({ success: true, schedule });
  } catch (error) {
    console.error('Error updating report schedule:', error);
    return res.status(500).json({ error: 'Database error updating report schedule.' });
  }
}

/**
 * Controller: Delete Report Schedule
 */
async function deleteSchedule(req, res) {
  try {
    const { id } = req.params;
    const schedule = await ReportSchedule.findByPk(id);
    if (!schedule) {
      return res.status(444).json({ error: 'Schedule not found.' });
    }

    await schedule.destroy();
    return res.json({ success: true, message: 'Schedule successfully deleted.' });
  } catch (error) {
    console.error('Error deleting report schedule:', error);
    return res.status(500).json({ error: 'Database error deleting report schedule.' });
  }
}

/**
 * Controller: Run Report Schedule Immediately
 */
async function runSchedule(req, res) {
  try {
    const { id } = req.params;
    const schedule = await ReportSchedule.findByPk(id);
    if (!schedule) {
      return res.status(444).json({ error: 'Schedule not found.' });
    }

    let resolvedType = schedule.report_id;
    if (resolvedType.startsWith('custom_')) {
      resolvedType = resolvedType.substring(7);
    }

    if (resolvedType === 'assets') resolvedType = 'inventory';
    if (resolvedType === 'audit') resolvedType = 'audit-logs';

    const reqMock = {
      user: req.user,
      body: {
        reportType: resolvedType,
        reportName: schedule.report_title,
        format: schedule.format,
        emailTo: schedule.recipients,
        emailNote: `Automated run of report schedule: ${schedule.name}`
      }
    };

    let responseData = null;
    const resMock = {
      status: (code) => {
        return {
          json: (err) => {
            throw new Error(err.error || 'Failed during mock execution');
          }
        };
      },
      json: (data) => {
        responseData = data;
        return data;
      }
    };

    await sendReportEmail(reqMock, resMock);

    schedule.last_run = new Date().toLocaleString();
    await schedule.save();

    return res.json({ success: true, message: `Report successfully generated and emailed.`, last_run: schedule.last_run });
  } catch (error) {
    console.error('Error running report schedule immediately:', error);
    return res.status(500).json({ error: 'Database error executing report schedule: ' + error.message });
  }
}

/**
 * Periodically executed schedule check and dispatch loop
 */
async function checkAndRunScheduledReports() {
  try {
    const now = new Date();

    // Fetch all active schedules at once — we'll decide individually
    const activeSchedules = await ReportSchedule.findAll({
      where: { active: true }
    });

    const currentDayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentDateNum = now.getDate();
    const currentYYYYMMDD = now.toISOString().slice(0, 10); // e.g. "2026-08-18"

    // Convert now to minutes-since-midnight for comparison
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // A schedule "matches" if its run_time was within the past 5 minutes
    const WINDOW_MINUTES = 5;

    if (activeSchedules.length === 0) return;

    console.log(`[SCHEDULES] Checking ${activeSchedules.length} active schedules at ${now.toTimeString().substring(0,5)}`);

    for (const schedule of activeSchedules) {
      let shouldRun = false;
      const lastRunStr = schedule.last_run;

      // Parse the schedule's run_time ("HH:MM") into minutes-since-midnight
      const [schedHH, schedMM] = (schedule.run_time || '00:00').split(':').map(Number);
      const schedMinutes = schedHH * 60 + schedMM;

      // Check if run_time is within the past WINDOW_MINUTES (handles server restarts)
      const minutesDiff = nowMinutes - schedMinutes;
      const isInWindow = minutesDiff >= 0 && minutesDiff < WINDOW_MINUTES;

      if (!isInWindow) continue; // Not the right time window — skip

      // Helper: has this schedule already run today?
      const alreadyRanToday = () => {
        if (!lastRunStr || lastRunStr === 'Never') return false;
        const lastRunDate = new Date(lastRunStr);
        return lastRunDate.toISOString().slice(0, 10) === currentYYYYMMDD;
      };

      if (schedule.frequency === 'daily') {
        shouldRun = !alreadyRanToday();

      } else if (schedule.frequency === 'weekly') {
        const schedDay = (schedule.run_day || '').trim().toLowerCase();
        if (schedDay === currentDayName) {
          if (!lastRunStr || lastRunStr === 'Never') {
            shouldRun = true;
          } else {
            const lastRunDate = new Date(lastRunStr);
            const diffDays = (now - lastRunDate) / (1000 * 60 * 60 * 24);
            shouldRun = diffDays >= 6.9;
          }
        }

      } else if (schedule.frequency === 'monthly') {
        const schedDate = parseInt(schedule.run_date, 10);
        if (schedDate === currentDateNum) {
          if (!lastRunStr || lastRunStr === 'Never') {
            shouldRun = true;
          } else {
            const lastRunDate = new Date(lastRunStr);
            const diffDays = (now - lastRunDate) / (1000 * 60 * 60 * 24);
            shouldRun = diffDays >= 27.9;
          }
        }
      }

      if (shouldRun) {
        console.log(`[SCHEDULES] Executing schedule "${schedule.name}" (report_id=${schedule.report_id}, format=${schedule.format})...`);

        let resolvedType = schedule.report_id;
        if (resolvedType.startsWith('custom_')) {
          resolvedType = resolvedType.substring(7);
        }
        if (resolvedType === 'assets') resolvedType = 'inventory';
        if (resolvedType === 'audit') resolvedType = 'audit-logs';

        console.log(`[SCHEDULES] Resolved reportType="${resolvedType}", recipients="${schedule.recipients}"`);

        let emailSentOk = false;

        const reqMock = {
          user: null,
          body: {
            reportType: resolvedType,
            reportName: schedule.report_title,
            format: schedule.format,
            emailTo: schedule.recipients,
            emailNote: `Automated run of report schedule: ${schedule.name}`
          }
        };

        const resMock = {
          status: (code) => ({
            json: (errBody) => {
              console.error(`[SCHEDULES ERROR] sendReportEmail returned HTTP ${code}:`, errBody);
            }
          }),
          json: (data) => {
            console.log(`[SCHEDULES] Email sent successfully:`, data);
            emailSentOk = true;
          }
        };

        try {
          await sendReportEmail(reqMock, resMock);
          if (emailSentOk) {
            schedule.last_run = now.toLocaleString();
            await schedule.save();
            console.log(`[SCHEDULES] ✅ Schedule "${schedule.name}" completed and last_run updated.`);
          } else {
            console.warn(`[SCHEDULES] ⚠️ Schedule "${schedule.name}" ran but email may not have sent (check SMTP logs above).`);
          }
        } catch (err) {
          console.error(`[SCHEDULES ERROR] Exception running schedule "${schedule.name}":`, err.message);
        }
      }
    }
  } catch (error) {
    console.error('[SCHEDULES ERROR] Error checking report schedules:', error);
  }
}

