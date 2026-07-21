const { Asset, AssetAllocation, User, Location, Ticket, SoftwareLicense, AuditLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

/**
 * Helper to generate table layout in PDFKit landscape document
 */
function generatePdfReport(reportTitle, headers, data, res) {
  const doc = new PDFDocument({ layout: 'landscape', margin: 30 });
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${reportTitle.toLowerCase().replace(/ /g, '_')}.pdf"`);
  
  doc.pipe(res);
  
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
    // Page breaking check
    if (startY + 20 > doc.page.height - 30) {
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
  const limit = parseInt(body.limit) || 10;
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

  return { assets: flattedAssets, locations, total };
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
  const limit = parseInt(body.limit) || 10;
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

  return { allocations, total };
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
  const limit = parseInt(body.limit) || 10;
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

  return { tickets, total };
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
  const limit = parseInt(body.limit) || 10;
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

  return { licenses, total };
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
  const limit = parseInt(body.limit) || 10;
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

  return { logs, total };
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
    if (!['inventory', 'allocations', 'tickets', 'licenses', 'audit-logs'].includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type.' });
    }
    if (!['excel', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Supported formats are excel and pdf.' });
    }

    // Force paginate to false for raw data export
    const queryBody = { ...req.body, paginate: false };

    let reportTitle = '';
    let headers = [];
    let data = [];

    if (reportType === 'inventory') {
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
      const sheetData = [headers, ...data];
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${reportTitle.toLowerCase().replace(/ /g, '_')}.xlsx"`);
      return res.send(buffer);
    } else if (format === 'pdf') {
      return generatePdfReport(reportTitle, headers, data, res);
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
  exportReport
};
