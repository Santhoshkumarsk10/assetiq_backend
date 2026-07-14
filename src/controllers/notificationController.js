const { Notification } = require('../models');

/**
 * List Notifications for the logged-in user
 */
async function listNotifications(req, res) {
  try {
    const notifications = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: 50
    });

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Error listing notifications:', error);
    return res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
}

/**
 * Mark one or all notifications as read
 */
async function markAsRead(req, res) {
  const { notification_id, mark_all } = req.body;
  try {
    if (mark_all) {
      await Notification.update(
        { is_read: true },
        { where: { user_id: req.user.id, is_read: false } }
      );
      return res.json({ message: 'All notifications marked as read.' });
    }

    if (!notification_id) {
      return res.status(400).json({ error: 'notification_id is required.' });
    }

    const notif = await Notification.findOne({
      where: { id: notification_id, user_id: req.user.id }
    });

    if (!notif) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    notif.is_read = true;
    await notif.save();

    return res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
}

module.exports = { listNotifications, markAsRead };
