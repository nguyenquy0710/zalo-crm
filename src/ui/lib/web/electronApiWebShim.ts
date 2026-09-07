/**
 * electronApiWebShim.ts — mirrors electron/preload.ts's `contextBridge.exposeInMainWorld('electronAPI', {...})`
 * for a plain browser tab (no Electron, no ipcRenderer). Every `ipcRenderer.invoke(channel, params)` call in
 * preload.ts becomes `proxyAction(channel, params)` here, a REST call to the already-running Boss server's
 * POST /api/proxy/action (see src/services/http/HttpRelayService.ts's handleProxyAction/executeProxyAction),
 * which runs through the SAME ipcHandlerRegistry that electron/ipc/*.ts's ipcMain.handle(channel, handler)
 * registers into — the same mechanism Employee desktop mode already uses today (electron/ipc/employeeIpc.ts's
 * `employee:proxyAction` handler -> HttpClientService.getInstance().proxyAction(channel, params)).
 *
 * A handful of methods are hand-written (desktop-only window chrome, native file dialogs, auto-updater, etc.)
 * instead of proxied — see inline comments below.
 *
 * IMPORTANT: channel strings and params shapes here must stay in sync with electron/preload.ts. If a channel
 * is added, renamed, or its params shape changes there, mirror the change here too.
 */
import type { TelegramForumTopicContext } from '../../../models/telegram';
import RestQueryService from '../../../services/http/RestQueryService';
import { on, removeAllListeners, connectWebEventBus, disconnectWebEventBus } from './webEventBus';
import { useEmployeeStore } from '../../store/employeeStore';

function proxyAction(channel: string, params?: any): Promise<any> {
  return RestQueryService.getInstance().proxyAction(channel, params);
}

// [nqdev] Phần snapshot (accountsData/employeesData/erpRole...) mà POST /api/auth/login trả về
// nhưng WebLoginScreen.tsx trước đây bỏ qua - App.tsx's "restore employee mode based on active
// workspace" đọc các field cachedXxx này từ object workspace (xem WorkspaceInfo trong
// store/workspaceStore.ts) để khôi phục permissions/accounts/employees ngay khi mount, không
// cần đợi các round-trip REST riêng lẻ. Chỉ giữ trong bộ nhớ (không localStorage) - mất khi
// F5, không sao vì WebLoginScreen chạy lại và set lại ngay từ đầu.
let webWorkspaceSnapshotCache: {
  erpRole?: string;
  erpExtraJson?: string;
  employeesData?: any[];
  accountsData?: any[];
} = {};

export function setWebWorkspaceSnapshotCache(snapshot: typeof webWorkspaceSnapshotCache | null | undefined): void {
  webWorkspaceSnapshotCache = snapshot || {};
}

/**
 * "Workspace" ảo duy nhất của tab trình duyệt - dựng từ employeeStore (WebLoginScreen.tsx set
 * ngay sau khi đăng nhập thành công) + webWorkspaceSnapshotCache ở trên. Không có khái niệm
 * multi-workspace trên web (1 tab = 1 kết nối tới đúng 1 Boss), nên đây luôn là workspace
 * "mặc định" duy nhất — xem workspace.getActive()/list() bên dưới.
 */
function buildWebWorkspace() {
  const emp = useEmployeeStore.getState();
  return {
    id: 'web',
    name: emp.currentEmployee?.display_name || 'Web',
    type: 'remote' as const,
    createdAt: Date.now(),
    bossUrl: emp.bossUrl,
    token: emp.token,
    employeeId: emp.currentEmployee?.employee_id,
    employeeName: emp.currentEmployee?.display_name,
    employeeUsername: emp.currentEmployee?.username,
    autoConnect: true,
    cachedPermissions: emp.currentEmployee?.permissions || [],
    cachedAssignedAccounts: emp.assignedAccounts,
    cachedErpRole: webWorkspaceSnapshotCache.erpRole,
    cachedErpExtraJson: webWorkspaceSnapshotCache.erpExtraJson,
    cachedEmployeesData: webWorkspaceSnapshotCache.employeesData,
    cachedAccountsData: webWorkspaceSnapshotCache.accountsData,
  };
}

export const electronApiWebShim = {
  // ─── Platform info ──────────────────────────────────────────────
  platform: 'web',

  // ─── Window Controls (no-op — no desktop window chrome in a browser tab) ──
  window: {
    minimize: () => {},
    maximize: () => {},
    close: () => {},
    quit: () => {},
    isMaximized: () => Promise.resolve(false),
  },

  // ─── Shell ───────────────────────────────────────────────────────
  shell: {
    openExternal: (url: string) => { window.open(url, '_blank', 'noopener'); },
    openPath: async (filePath: string) => ({ success: false, error: 'Không hỗ trợ mở file cục bộ trên bản web' }),
    openInApp: async (url: string) => { window.open(url, '_blank', 'noopener'); return { success: true }; },
  },

  // ─── Util ───────────────────────────────────────────────────────
  util: {
    fetchUrl: (args: { url: string }) => proxyAction('util:fetchUrl', args),
  },

  // ─── Login / Account ─────────────────────────────────────────────
  login: {
    loginQR: (tempId: string, proxyId?: number | null) => proxyAction('login:qr', { tempId, proxyId }),
    loginQRAbort: (tempId: string) => proxyAction('login:qr:abort', { tempId }),
    loginCookies: (imei: string, cookies: string, userAgent: string) =>
      proxyAction('login:cookies', { imei, cookies, userAgent }),
    loginAuth: (authJson: string, proxyId?: number | null) => proxyAction('login:auth', { authJson, proxyId }),
    connectAccount: (auth: any) => proxyAction('login:connect', { auth }),
    disconnectAccount: (zaloId: string) => proxyAction('login:disconnect', { zaloId }),
    disconnectAll: () => proxyAction('login:disconnectAll'),
    getAccounts: () => proxyAction('login:getAccounts'),
    removeAccount: (zaloId: string, deleteData?: boolean) => proxyAction('login:removeAccount', { zaloId, deleteData }),
    getMediaAutoDelete: (zaloId: string) => proxyAction('login:getMediaAutoDelete', { zaloId }),
    setMediaAutoDelete: (zaloId: string, enabled: boolean, days: number) => proxyAction('login:setMediaAutoDelete', { zaloId, enabled, days }),
    runAllMediaCleanup: () => proxyAction('login:runAllMediaCleanup'),
    checkHealth: (zaloIds: string | string[]) => proxyAction('login:checkHealth', { zaloIds }),
    checkAndRefreshAvatar: (zaloId: string) => proxyAction('login:checkAndRefreshAvatar', { zaloId }),
    requestOldMessages: (zaloId: string) => proxyAction('login:requestOldMessages', { zaloId }),
  },

  // ─── Zalo API ────────────────────────────────────────────────────
  zalo: {
    sendMessage: (params: any) => proxyAction('zalo:sendMessage', params),
    sendImage: (params: any) => proxyAction('zalo:sendImage', params),
    sendImages: (params: any) => proxyAction('zalo:sendImages', params),
    sendFile: (params: any) => proxyAction('zalo:sendFile', params),
    sendSticker: (params: any) => proxyAction('zalo:sendSticker', params),
    sendVoice: (params: any) => proxyAction('zalo:sendVoice', params),
    sendVideo: (params: any) => proxyAction('zalo:sendVideo', params),
    sendLink: (params: any) => proxyAction('zalo:sendLink', params),
    sendCard: (params: any) => proxyAction('zalo:sendCard', params),
    undoMessage: (params: any) => proxyAction('zalo:undoMessage', params),
    deleteMessage: (params: any) => proxyAction('zalo:deleteMessage', params),
    deleteChat: (params: any) => proxyAction('zalo:deleteChat', params),
    addReaction: (params: any) => proxyAction('zalo:addReaction', params),
    forwardMessage: (params: any) => proxyAction('zalo:forwardMessage', params),
    getFriends: (auth: any) => proxyAction('zalo:getFriends', { auth }),
    getGroups: (auth: any) => proxyAction('zalo:getGroups', { auth }),
    getUserInfo: (params: any) => proxyAction('zalo:getUserInfo', params),
    getContext: (params: any) => proxyAction('zalo:getContext', params),
    findUser: (params: any) => proxyAction('zalo:findUser', params),
    sendFriendRequest: (params: any) => proxyAction('zalo:sendFriendRequest', params),
    acceptFriendRequest: (params: any) => proxyAction('zalo:acceptFriendRequest', params),
    rejectFriendRequest: (params: any) => proxyAction('zalo:rejectFriendRequest', params),
    undoFriendRequest: (params: any) => proxyAction('zalo:undoFriendRequest', params),
    removeFriend: (params: any) => proxyAction('zalo:removeFriend', params),
    getSentFriendRequests: (auth: any) => proxyAction('zalo:getSentFriendRequests', { auth }),
    getFriendRequestStatus: (params: any) => proxyAction('zalo:getFriendRequestStatus', params),
    getFriendRecommendations: (auth: any) => proxyAction('zalo:getFriendRecommendations', { auth }),
    getAliasList: (params: any) => proxyAction('zalo:getAliasList', params),
    blockUser: (params: any) => proxyAction('zalo:blockUser', params),
    unblockUser: (params: any) => proxyAction('zalo:unblockUser', params),
    getRelatedFriendGroup: (params: any) => proxyAction('zalo:getRelatedFriendGroup', params),
    createGroup: (params: any) => proxyAction('zalo:createGroup', params),
    getGroupInfo: (params: any) => proxyAction('zalo:getGroupInfo', params),
    addUserToGroup: (params: any) => proxyAction('zalo:addUserToGroup', params),
    removeUserFromGroup: (params: any) => proxyAction('zalo:removeUserFromGroup', params),
    leaveGroup: (params: any) => proxyAction('zalo:leaveGroup', params),
    changeGroupName: (params: any) => proxyAction('zalo:changeGroupName', params),
    changeGroupAvatar: (params: any) => proxyAction('zalo:changeGroupAvatar', params),
    changeGroupOwner: (params: any) => proxyAction('zalo:changeGroupOwner', params),
    disperseGroup: (params: any) => proxyAction('zalo:disperseGroup', params),
    addGroupDeputy: (params: any) => proxyAction('zalo:addGroupDeputy', params),
    removeGroupDeputy: (params: any) => proxyAction('zalo:removeGroupDeputy', params),
    getGroupMembersInfo: (params: any) => proxyAction('zalo:getGroupMembersInfo', params),
    addGroupBlockedMember: (params: any) => proxyAction('zalo:addGroupBlockedMember', params),
    removeGroupBlockedMember: (params: any) => proxyAction('zalo:removeGroupBlockedMember', params),
    getGroupBlockedMember: (params: any) => proxyAction('zalo:getGroupBlockedMember', params),
    inviteUserToGroups: (params: any) => proxyAction('zalo:inviteUserToGroups', params),
    updateGroupSettings: (params: any) => proxyAction('zalo:updateGroupSettings', params),
    getGroupLinkDetail: (params: any) => proxyAction('zalo:getGroupLinkDetail', params),
    getGroupLinkInfo: (params: any) => proxyAction('zalo:getGroupLinkInfo', params),
    joinGroupLink: (params: any) => proxyAction('zalo:joinGroupLink', params),
    enableGroupLink: (params: any) => proxyAction('zalo:enableGroupLink', params),
    disableGroupLink: (params: any) => proxyAction('zalo:disableGroupLink', params),
    getPendingGroupMembers: (params: any) => proxyAction('zalo:getPendingGroupMembers', params),
    reviewPendingMemberRequest: (params: any) => proxyAction('zalo:reviewPendingMemberRequest', params),
    getMessageHistory: (params: any) => proxyAction('zalo:getMessageHistory', params),
    getGroupChatHistory: (params: any) => proxyAction('zalo:getGroupChatHistory', params),
    getPinConversations: (auth: any) => proxyAction('zalo:getPinConversations', { auth }),
    setPinConversation: (params: any) => proxyAction('zalo:setPinConversation', params),
    setMute: (params: any) => proxyAction('zalo:setMute', params),
    keepAlive: (auth: any) => proxyAction('zalo:keepAlive', { auth }),
    getLabels: (params: any) => proxyAction('zalo:getLabels', params),
    updateLabels: (params: any) => proxyAction('zalo:updateLabels', params),
    changeFriendAlias: (params: any) => proxyAction('zalo:changeFriendAlias', params),
    getStickers: (params: any) => proxyAction('zalo:getStickers', params),
    getStickersDetail: (params: any) => proxyAction('zalo:getStickersDetail', params),
    getStickerCategoryDetail: (params: any) => proxyAction('zalo:getStickerCategoryDetail', params),
    addUnreadMark: (params: any) => proxyAction('zalo:addUnreadMark', params),
    removeUnreadMark: (params: any) => proxyAction('zalo:removeUnreadMark', params),
    createPoll: (params: any) => proxyAction('zalo:createPoll', params),
    getPollDetail: (params: any) => proxyAction('zalo:getPollDetail', params),
    lockPoll: (params: any) => proxyAction('zalo:lockPoll', params),
    doVotePoll: (params: any) => proxyAction('zalo:doVotePoll', params),
    addPollOption: (params: any) => proxyAction('zalo:addPollOption', params),
    uploadVideoThumb: (params: any) => proxyAction('zalo:uploadVideoThumb', params),
    uploadVideoFile: (params: any) => proxyAction('zalo:uploadVideoFile', params),
    uploadVoiceFile: (params: any) => proxyAction('zalo:uploadVoiceFile', params),
    getQuickMessageList: (params: any) => proxyAction('zalo:getQuickMessageList', params),
    addQuickMessage: (params: any) => proxyAction('zalo:addQuickMessage', params),
    updateQuickMessage: (params: any) => proxyAction('zalo:updateQuickMessage', params),
    removeQuickMessage: (params: any) => proxyAction('zalo:removeQuickMessage', params),
    createNote: (params: any) => proxyAction('zalo:createNote', params),
    editNote: (params: any) => proxyAction('zalo:editNote', params),
    createReminder: (params: any) => proxyAction('zalo:createReminder', params),
    editReminder: (params: any) => proxyAction('zalo:editReminder', params),
    removeReminder: (params: any) => proxyAction('zalo:removeReminder', params),
    getListReminder: (params: any) => proxyAction('zalo:getListReminder', params),
    getReminder: (params: any) => proxyAction('zalo:getReminder', params),
    sendSeenEvent: (params: any) => proxyAction('zalo:sendSeenEvent', params),
    sendBankCard: (params: any) => proxyAction('zalo:sendBankCard', params),
  },

  db: {
    getMessages: (params: any) => proxyAction('db:getMessages', params),
    getMessagesAround: (params: any) => proxyAction('db:getMessagesAround', params),
    getContacts: (zaloId: string) => proxyAction('db:getContacts', { zaloId }),
    getContactsFiltered: (params: any) => proxyAction('db:getContactsFiltered', params),
    saveAccount: (account: any) => proxyAction('db:saveAccount', account),
    searchContactByPhone: (params: { zaloId: string; phone: string }) => proxyAction('db:searchContactByPhone', params),
    searchMessages: (params: any) => proxyAction('db:searchMessages', params),
    getMediaMessages: (params: any) => proxyAction('db:getMediaMessages', params),
    getFileMessages: (params: any) => proxyAction('db:getFileMessages', params),
    getUnreadCount: (zaloId: string) => proxyAction('db:getUnreadCount', { zaloId }),
    markAsRead: (params: any) => proxyAction('db:markAsRead', params),
    markMessageRecalled: (params: any) => proxyAction('db:markMessageRecalled', params),
    deleteMessages: (params: any) => proxyAction('db:deleteMessages', params),
    updateContactProfile: (params: any) => proxyAction('db:updateContactProfile', params),
    updateAccountPhone: (params: any) => proxyAction('db:updateAccountPhone', params),
    updateReaction: (params: any) => proxyAction('db:updateReaction', params),
    updateLocalPaths: (params: any) => proxyAction('db:updateLocalPaths', params),
    getMessageById: (params: any) => proxyAction('db:getMessageById', params),
    getMessagesByIds: (params: any) => proxyAction('db:getMessagesByIds', params),
    getStoragePath: () => proxyAction('db:getStoragePath'),
    setStoragePath: (params: any) => proxyAction('db:setStoragePath', params),
    // [nqdev-web-shim] Native folder picker — không áp dụng trên bản web, không proxy qua Boss
    selectStorageFolder: async () => ({ success: false, error: 'Không áp dụng trên bản web' }),
    getFriends: (params: any) => proxyAction('db:getFriends', params),
    saveFriends: (params: any) => proxyAction('db:saveFriends', params),
    isFriend: (params: any) => proxyAction('db:isFriend', params),
    getFriendRequests: (params: any) => proxyAction('db:getFriendRequests', params),
    saveFriendRequests: (params: any) => proxyAction('db:saveFriendRequests', params),
    upsertFriendRequest: (params: any) => proxyAction('db:upsertFriendRequest', params),
    removeFriendRequest: (params: any) => proxyAction('db:removeFriendRequest', params),
    addFriend: (params: any) => proxyAction('db:addFriend', params),
    removeFriend: (params: any) => proxyAction('db:removeFriend', params),
    deleteConversation: (params: any) => proxyAction('db:deleteConversation', params),
    getLinks: (params: any) => proxyAction('db:getLinks', params),
    saveLink: (params: any) => proxyAction('db:saveLink', params),
    getGroupMembers: (params: any) => proxyAction('db:getGroupMembers', params),
    getAllGroupMembers: (params: any) => proxyAction('db:getAllGroupMembers', params),
    saveGroupMembers: (params: any) => proxyAction('db:saveGroupMembers', params),
    upsertGroupMember: (params: any) => proxyAction('db:upsertGroupMember', params),
    removeGroupMember: (params: any) => proxyAction('db:removeGroupMember', params),
    saveStickers: (params: any) => proxyAction('db:saveStickers', params),
    getStickerById: (params: any) => proxyAction('db:getStickerById', params),
    getRecentStickers: (params?: any) => proxyAction('db:getRecentStickers', params || {}),
    addRecentSticker: (params: any) => proxyAction('db:addRecentSticker', params),
    markStickerUnsupported: (params: any) => proxyAction('db:markStickerUnsupported', params),
    saveStickerPacks: (params: any) => proxyAction('db:saveStickerPacks', params),
    getStickerPacks: (params?: any) => proxyAction('db:getStickerPacks', params || {}),
    getStickersByPackId: (params: any) => proxyAction('db:getStickersByPackId', params),
    saveKeywordStickers: (params: any) => proxyAction('db:saveKeywordStickers', params),
    getKeywordStickers: (params: any) => proxyAction('db:getKeywordStickers', params),
    getStickersByIds: (params: any) => proxyAction('db:getStickersByIds', params),
    getAllCachedPackSummaries: (params?: any) => proxyAction('db:getAllCachedPackSummaries', params || {}),
    getPinnedMessages: (params: any) => proxyAction('db:getPinnedMessages', params),
    getMessagesByType: (params: any) => proxyAction('db:getMessagesByType', params),
    pinMessage: (params: any) => proxyAction('db:pinMessage', params),
    unpinMessage: (params: any) => proxyAction('db:unpinMessage', params),
    bringPinnedToTop: (params: any) => proxyAction('db:bringPinnedToTop', params),
    getLocalQuickMessages: (params: any) => proxyAction('db:getLocalQuickMessages', params),
    upsertLocalQuickMessage: (params: any) => proxyAction('db:upsertLocalQuickMessage', params),
    deleteLocalQuickMessage: (params: any) => proxyAction('db:deleteLocalQuickMessage', params),
    bulkReplaceLocalQuickMessages: (params: any) => proxyAction('db:bulkReplaceLocalQuickMessages', params),
    getAllLocalQuickMessages: () => proxyAction('db:getAllLocalQuickMessages'),
    cloneLocalQuickMessages: (params: any) => proxyAction('db:cloneLocalQuickMessages', params),
    setLocalQMActive: (params: any) => proxyAction('db:setLocalQMActive', params),
    setLocalQMOrder: (params: any) => proxyAction('db:setLocalQMOrder', params),

    // Local Labels
    getLocalLabels: (params: any) => proxyAction('db:getLocalLabels', params),
    upsertLocalLabel: (params: any) => proxyAction('db:upsertLocalLabel', params),
    deleteLocalLabel: (params: any) => proxyAction('db:deleteLocalLabel', params),
    cloneLocalLabels: (params: any) => proxyAction('db:cloneLocalLabels', params),
    getLocalLabelThreads: (params: any) => proxyAction('db:getLocalLabelThreads', params),
    assignLocalLabelToThread: (params: any) => proxyAction('db:assignLocalLabelToThread', params),
    bulkAssignLocalLabelToThread: (params: any) => proxyAction('db:bulkAssignLocalLabelToThread', params),
    removeLocalLabelFromThread: (params: any) => proxyAction('db:removeLocalLabelFromThread', params),
    getThreadLocalLabels: (params: any) => proxyAction('db:getThreadLocalLabels', params),
    setLocalLabelActive: (params: any) => proxyAction('db:setLocalLabelActive', params),
    setLocalLabelOrder: (params: any) => proxyAction('db:setLocalLabelOrder', params),

    setContactFlags: (params: any) => proxyAction('db:setContactFlags', params),
    getContactsWithFlags: (params: any) => proxyAction('db:getContactsWithFlags', params),
    setContactAlias: (params: any) => proxyAction('db:setContactAlias', params),

    // Message Drafts
    upsertDraft: (params: any) => proxyAction('db:upsertDraft', params),
    deleteDraft: (params: any) => proxyAction('db:deleteDraft', params),
    getDraft: (params: any) => proxyAction('db:getDraft', params),
    getDrafts: (params: any) => proxyAction('db:getDrafts', params),
    deleteOldDrafts: (params?: any) => proxyAction('db:deleteOldDrafts', params || {}),

    // Bank Cards
    getBankCards: (params: any) => proxyAction('db:getBankCards', params),
    upsertBankCard: (params: any) => proxyAction('db:upsertBankCard', params),
    deleteBankCard: (params: any) => proxyAction('db:deleteBankCard', params),

    // Local Pinned Conversations
    getLocalPinnedConversations: (params: any) => proxyAction('db:getLocalPinnedConversations', params),
    setLocalPinnedConversation: (params: any) => proxyAction('db:setLocalPinnedConversation', params),
  },

  // ─── CRM ─────────────────────────────────────────────────────────
  crm: {
    getNotes: (params: any) => proxyAction('crm:getNotes', params),
    saveNote: (params: any) => proxyAction('crm:saveNote', params),
    deleteNote: (params: any) => proxyAction('crm:deleteNote', params),
    getContacts: (params: any) => proxyAction('crm:getContacts', params),
    getContactStats: (params: any) => proxyAction('crm:getContactStats', params),
    getCampaigns: (params: any) => proxyAction('crm:getCampaigns', params),
    saveCampaign: (params: any) => proxyAction('crm:saveCampaign', params),
    deleteCampaign: (params: any) => proxyAction('crm:deleteCampaign', params),
    cloneCampaign: (params: any) => proxyAction('crm:cloneCampaign', params),
    updateCampaignStatus: (params: any) => proxyAction('crm:updateCampaignStatus', params),
    addCampaignContacts: (params: any) => proxyAction('crm:addCampaignContacts', params),
    getCampaignContacts: (params: any) => proxyAction('crm:getCampaignContacts', params),
    deleteCampaignContacts: (params: any) => proxyAction('crm:deleteCampaignContacts', params),
    deleteAllCampaignContacts: (params: any) => proxyAction('crm:deleteAllCampaignContacts', params),
    getSendLog: (params: any) => proxyAction('crm:getSendLog', params),
    getQueueStatus: (params: any) => proxyAction('crm:getQueueStatus', params),
    getCampaignStats: (params: any) => proxyAction('crm:getCampaignStats', params),
    getActivityStats: (params: any) => proxyAction('crm:getActivityStats', params),
  },

  // ─── Analytics / Reporting ──────────────────────────────────────────
  analytics: {
    dashboardOverview:   (params: any) => proxyAction('analytics:dashboardOverview', params),
    messageVolume:       (params: any) => proxyAction('analytics:messageVolume', params),
    peakHours:           (params: any) => proxyAction('analytics:peakHours', params),
    contactGrowth:       (params: any) => proxyAction('analytics:contactGrowth', params),
    contactSegmentation: (params: any) => proxyAction('analytics:contactSegmentation', params),
    campaignComparison:  (params: any) => proxyAction('analytics:campaignComparison', params),
    friendRequests:      (params: any) => proxyAction('analytics:friendRequests', params),
    workflowAnalytics:   (params: any) => proxyAction('analytics:workflowAnalytics', params),
    aiAnalytics:         (params: any) => proxyAction('analytics:aiAnalytics', params),
    responseTime:        (params: any) => proxyAction('analytics:responseTime', params),
    labelUsage:          (params: any) => proxyAction('analytics:labelUsage', params),
  },

  // ─── File ────────────────────────────────────────────────────────
  file: {
    // [nqdev-web-shim] Native OS file picker — không proxy-able trên bản web
    openDialog: async (options: any) => ({ success: false, error: 'Chưa hỗ trợ chọn file qua dialog trên bản web — dùng input file trong giao diện' }),
    saveImage: (params: any) => proxyAction('file:saveImage', params),
    // [nqdev-web-shim] Đường dẫn thư mục dữ liệu app — không áp dụng trên bản web
    getAppDataPath: async () => ({ success: false, error: 'Không áp dụng trên bản web' }),
    openPath: (filePath: string) => proxyAction('file:openPath', filePath),
    showItemInFolder: (filePath: string) => proxyAction('file:showItemInFolder', filePath),
    // [nqdev-web-shim] Thao tác trên filesystem cục bộ — chưa hỗ trợ trên bản web
    saveAs: async (params: any) => ({ success: false, error: 'Chưa hỗ trợ trên bản web' }),
    saveTempBlob: async (params: any) => ({ success: false, error: 'Chưa hỗ trợ trên bản web' }),
    getVideoMeta: (params: any) => proxyAction('file:getVideoMeta', params),
    readImageAsBase64: (params: { localPath?: string; remoteUrl?: string }) => proxyAction('file:readImageAsBase64', params),
    repairImage: (params: any) => proxyAction('file:repairImage', params),
    ensureFaststart: (params: { filePath: string }) => proxyAction('file:ensureFaststart', params),
    validateLocalImages: (items: any) => proxyAction('file:validateLocalImages', items),
    // [nqdev-web-shim] Chụp màn hình desktop — không hỗ trợ trên bản web
    captureScreenshot: async () => ({ success: false, error: 'Không hỗ trợ chụp màn hình trên bản web' }),
    resolveMediaUrl: (bossUrl: string, mediaType?: string) => proxyAction('media:resolveUrl', { bossUrl, mediaType }),
    hasMediaCache: (bossUrl: string) => proxyAction('media:hasCache', { bossUrl }),
    preloadMediaBatch: (urls: string[]) => proxyAction('media:preloadBatch', { urls }),
    ensureMediaLocal: (bossUrl: string, mediaType?: string) => proxyAction('file:employeeEnsureMediaLocal', { bossUrl, mediaType }),
  },

  // ─── Workflow Engine ─────────────────────────────────────────────
  workflow: {
    list: () => proxyAction('workflow:list'),
    get: (id: string) => proxyAction('workflow:get', { id }),
    save: (workflow: any) => proxyAction('workflow:save', { workflow }),
    delete: (id: string) => proxyAction('workflow:delete', { id }),
    toggle: (id: string, enabled: boolean) => proxyAction('workflow:toggle', { id, enabled }),
    runManual: (id: string, triggerData?: any) => proxyAction('workflow:runManual', { id, triggerData }),
    getLogs: (id: string, limit?: number) => proxyAction('workflow:getLogs', { id, limit }),
    deleteLogs: (id: string) => proxyAction('workflow:deleteLogs', { id }),
    clone: (id: string, targetZaloId: string) => proxyAction('workflow:clone', { id, targetZaloId }),
    cloneAll: (sourceZaloId: string, targetZaloId: string) => proxyAction('workflow:cloneAll', { sourceZaloId, targetZaloId }),
    getWebhookUrl: (id: string) => proxyAction('workflow:getWebhookUrl', { id }),
    regenerateWebhookToken: (id: string) => proxyAction('workflow:regenerateWebhookToken', { id }),
    startTunnel: () => proxyAction('workflow:startTunnel'),
    stopTunnel: () => proxyAction('workflow:stopTunnel'),
    getTunnelStatus: () => proxyAction('workflow:getTunnelStatus'),
    getPortConfig: () => proxyAction('workflow:getPortConfig'),
    setPortConfig: (key: string, port: number) => proxyAction('workflow:setPortConfig', { key, port }),
  },

  // ─── App-level (badge, open thread) — no-op: no taskbar/dock/window focus in a browser tab ──
  app: {
    setBadge: (count: number) => {},
    openThread: (params: { zaloId: string; threadId: string; threadType: number }) => {},
    sendBadgeImage: (params: { dataUrl: string; count: number }) => {},
    flashFrame: (active: boolean) => {},
  },

  // ─── Auto-update — no-op: no installer/auto-updater concept for a web page ──
  update: {
    check:         () => {},
    download:      () => {},
    install:       () => {},
    rendererReady: () => {},
  },

  // ─── Nhật ký (Logger) ─────────────────────────────────────────────
  logs: {
    getBuffer: () => proxyAction('log:getBuffer'),
    clear:     () => proxyAction('log:clear'),
  },

  // ─── Integration Hub ──────────────────────────────────────────────
  integration: {
    list:            () => proxyAction('integration:list'),
    get:             (id: string) => proxyAction('integration:get', { id }),
    save:            (integration: any) => proxyAction('integration:save', { integration }),
    delete:          (id: string) => proxyAction('integration:delete', { id }),
    toggle:          (id: string, enabled: boolean) => proxyAction('integration:toggle', { id, enabled }),
    test:            (id: string) => proxyAction('integration:test', { id }),
    execute:         (id: string, action: string, params?: any) => proxyAction('integration:execute', { id, action, params }),
    executeByType:   (type: string, action: string, params?: any) => proxyAction('integration:executeByType', { type, action, params }),
    getWebhookPort:  () => proxyAction('integration:getWebhookPort'),
  },

  // ─── AI Assistants ────────────────────────────────────────────────
  ai: {
    listAssistants:  () => proxyAction('ai:listAssistants'),
    getAssistant:    (id: string) => proxyAction('ai:getAssistant', { id }),
    getDefault:      () => proxyAction('ai:getDefault'),
    saveAssistant:   (assistant: any) => proxyAction('ai:saveAssistant', { assistant }),
    deleteAssistant: (id: string) => proxyAction('ai:deleteAssistant', { id }),
    testAssistant:   (id: string) => proxyAction('ai:testAssistant', { id }),
    getFiles:        (assistantId: string) => proxyAction('ai:getFiles', { assistantId }),
    uploadFile:      (assistantId: string, filePath: string) => proxyAction('ai:uploadFile', { assistantId, filePath }),
    removeFile:      (fileId: number) => proxyAction('ai:removeFile', { fileId }),
    suggest:         (assistantId: string, chatHistory: any[]) => proxyAction('ai:suggest', { assistantId, chatHistory }),
    chat:            (assistantId: string, messages: any[], structured?: boolean, maxTokens?: number) => proxyAction('ai:chat', { assistantId, messages, structured, maxTokens }),
    getAccountAssistant:  (zaloId: string, role: string) => proxyAction('ai:getAccountAssistant', { zaloId, role }),
    setAccountAssistant:  (zaloId: string, role: string, assistantId: string | null) => proxyAction('ai:setAccountAssistant', { zaloId, role, assistantId }),
    getAccountAssistants: (zaloId: string) => proxyAction('ai:getAccountAssistants', { zaloId }),
    getUsageLogs:  (opts?: any) => proxyAction('ai:getUsageLogs', opts || {}),
    getUsageStats: (opts?: any) => proxyAction('ai:getUsageStats', opts || {}),
    // AI Conversations
    getOrCreateConversation: (params: any) => proxyAction('ai:getOrCreateConversation', params),
    getConversationMessages: (params: any) => proxyAction('ai:getConversationMessages', params),
    addConversationMessage:  (params: any) => proxyAction('ai:addConversationMessage', params),
    getConversations:        (params: any) => proxyAction('ai:getConversations', params),
    deleteConversation:      (params: any) => proxyAction('ai:deleteConversation', params),
  },

  // ─── Tunnel ───────────────────────────────────────────────────────
  tunnel: {
    start:  () => proxyAction('tunnel:start'),
    stop:   () => proxyAction('tunnel:stop'),
    status: () => proxyAction('tunnel:status'),
    getAll: () => proxyAction('tunnel:getAll'),
  },

  // ─── Employee Management ───────────────────────────────────────────
  employee: {
    list:               () => proxyAction('employee:list'),
    getById:            (employeeId: string) => proxyAction('employee:getById', { employeeId }),
    // [nqdev-web-shim] create/update/delete/setPermissions/assignAccounts = quản trị nhân viên (admin-only
    // trên desktop Boss UI), nhưng HttpRelayService.channelToModule() không gate quyền cho channel
    // "employee:*" — vô hiệu hoá ở web shim để tránh 1 employee bất kỳ tự cấp quyền/xoá nhân viên khác
    // qua bản web. Cần audit + thêm permission check phía server (HttpRelayService) trước khi bật lại.
    create:             async (_params: any) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    update:             async (_employeeId: string, _updates: any) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    delete:             async (_employeeId: string) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    setPermissions:     async (_employeeId: string, _permissions: any[]) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    getPermissions:     (employeeId: string) => proxyAction('employee:getPermissions', { employeeId }),
    assignAccounts:     async (_employeeId: string, _zaloIds: string[]) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    getAssignedAccounts:(employeeId: string) => proxyAction('employee:getAssignedAccounts', { employeeId }),
    getStats:           (employeeId: string, sinceTs?: number, untilTs?: number) => proxyAction('employee:getStats', { employeeId, sinceTs, untilTs }),
    getSessions:        (employeeId: string, limit?: number) => proxyAction('employee:getSessions', { employeeId, limit }),
    login:              (username: string, password: string) => proxyAction('employee:login', { username, password }),
    validateToken:      (token: string) => proxyAction('employee:validateToken', { token }),
    // [nqdev-web-shim] setMode/connectToBoss/disconnectFromBoss/getConnectionStatus/getMode điều khiển
    // trạng thái tiến trình Electron main CỤC BỘ của người gọi (AppModeManager, HttpClientService) —
    // proxy thẳng các channel này lên Boss sẽ vô tình đổi MODE CỦA CHÍNH BOSS (nguy hiểm). Trình duyệt
    // không có main process riêng nên xử lý cục bộ bằng RestQueryService/webEventBus thay vì proxy.
    setMode:            async (_mode: string) => ({ success: true }),
    getMode:            async () => ({ mode: 'employee' }),
    connectToBoss:      async (bossUrl: string, token: string) => {
      RestQueryService.getInstance().init(bossUrl, token);
      connectWebEventBus(bossUrl, token);
      return { success: true };
    },
    disconnectFromBoss: async () => {
      RestQueryService.getInstance().reset();
      disconnectWebEventBus();
      return { success: true };
    },
    getConnectionStatus:async () => {
      const rest = RestQueryService.getInstance();
      return { connected: rest.isConnected(), bossUrl: rest.getBaseUrl(), latency: 0 };
    },
    proxyAction:        (channel: string, params: any) => proxyAction(channel, params),
    // Groups
    listGroups:         () => proxyAction('employee:listGroups'),
    createGroup:        (name: string, color?: string) => proxyAction('employee:createGroup', { name, color }),
    updateGroup:        (groupId: string, updates: any) => proxyAction('employee:updateGroup', { groupId, updates }),
    deleteGroup:        (groupId: string) => proxyAction('employee:deleteGroup', { groupId }),
    // Analytics
    analyticsComparison:     (sinceTs: number, untilTs: number) => proxyAction('employee:analytics:comparison', { sinceTs, untilTs }),
    analyticsMessageTimeline:(sinceTs: number, untilTs: number) => proxyAction('employee:analytics:messageTimeline', { sinceTs, untilTs }),
    analyticsOnlineTimeline: (sinceTs: number, untilTs: number) => proxyAction('employee:analytics:onlineTimeline', { sinceTs, untilTs }),
    analyticsResponseDist:   (sinceTs: number, untilTs: number) => proxyAction('employee:analytics:responseDistribution', { sinceTs, untilTs }),
    analyticsHourlyActivity: (sinceTs: number, untilTs: number) => proxyAction('employee:analytics:hourlyActivity', { sinceTs, untilTs }),
  },

  // ─── Workspace Management ────────────────────────────────────────
  // [nqdev-web-shim] "workspace" = multi-workspace quản lý trên MÁY CỦA NGƯỜI GỌI (danh sách DB
  // local, đang active workspace nào...) — khái niệm desktop-only, không áp dụng cho 1 tab trình
  // duyệt kết nối tới đúng 1 Boss. QUAN TRỌNG: HttpRelayService.channelToModule() hiện KHÔNG kiểm
  // tra quyền cho channel "workspace:*" (chỉ check zalo/crm/workflow/integration/ai) — proxy thẳng
  // các hàm GHI (create/update/delete/switch/connectRemote/disconnectRemote) lên Boss sẽ cho phép
  // BẤT KỲ employee nào đổi/xoá workspace của chính Boss, nên các hàm đó vẫn bị vô hiệu hoá.
  //
  // list()/getActive() là ngoại lệ: đây là 2 hàm ĐỌC-CỤC-BỘ (không proxy lên Boss, xem
  // buildWebWorkspace() ở đầu file) nên không mở lỗ hổng gì — và App.tsx dựa vào
  // `activeWs.type === 'remote'` ở HÀNG LOẠT chỗ để quyết định có gọi Zalo trực tiếp hay dùng
  // REST, có skip healthcheck cục bộ hay không, v.v. Trả lỗi cứng như cũ khiến mọi nhánh đó hiểu
  // nhầm đang chạy desktop/Boss cục bộ. Luôn trả về đúng 1 "workspace mặc định" phản ánh
  // employeeStore hiện tại (đã được WebLoginScreen.tsx set ngay sau đăng nhập).
  workspace: {
    list:                 async () => ({ success: true, workspaces: [buildWebWorkspace()] }),
    getActive:            async () => ({ success: true, workspace: buildWebWorkspace() }),
    create:               async (_params: any) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    update:               async (_id: string, _updates: any) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    delete:               async (_id: string) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    switch:               async (_id: string) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    isMulti:              async () => ({ success: true, isMulti: false }),
    getDbPath:            async (_id: string) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    connectRemote:        async (_id: string, _bossUrl: string, _token: string) =>
                            ({ success: false, error: 'Không áp dụng trên bản web' }),
    disconnectRemote:     async (_id: string) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    getConnectionStatus:  async (_id: string) => ({ connected: RestQueryService.getInstance().isConnected() }),
    getAllStatuses:        async () => ({ success: false, error: 'Không áp dụng trên bản web' }),
    // [nqdev-web-shim] Trùng chức năng với RestQueryService.login() mà WebLoginScreen.tsx đã gọi thẳng —
    // không cần proxy qua Boss.
    loginRemote:          async (_bossUrl: string, _username: string, _password: string) =>
                            ({ success: false, error: 'Không áp dụng trên bản web' }),
  },

  // ─── Relay Server (Boss) ──────────────────────────────────────────
  // [nqdev-web-shim] Toàn bộ namespace này quản trị relay server CỦA CHÍNH BOSS (start/stop server,
  // kick nhân viên khác, đổi cấu hình tunnel/authtoken). channelToModule() không gate quyền cho
  // "relay:*" → vô hiệu hoá hoàn toàn ở web shim để 1 employee bất kỳ không thể tắt server hoặc kick
  // người khác qua bản web. Đây là UI quản trị dành cho desktop Boss, cần audit quyền phía server
  // trước khi cân nhắc bật lại cho web.
  relay: {
    startServer:         async (_port?: number) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    stopServer:          async () => ({ success: false, error: 'Không áp dụng trên bản web' }),
    getServerStatus:     async () => ({ success: false, error: 'Không áp dụng trên bản web' }),
    kickEmployee:        async (_employeeId: string) => ({ success: false, error: 'Không áp dụng trên bản web' }),
    startTunnel:         async () => ({ success: false, error: 'Không áp dụng trên bản web' }),
    stopTunnel:          async () => ({ success: false, error: 'Không áp dụng trên bản web' }),
    getTunnelStatus:     async () => ({ success: false, error: 'Không áp dụng trên bản web' }),
    getTunnelConfig:     async () => ({ success: false, error: 'Không áp dụng trên bản web' }),
    setTunnelConfig:     async (_cfg: { provider?: string; authtoken?: string; domain?: string }) => ({ success: false, error: 'Không áp dụng trên bản web' }),
  },

  // ─── Facebook ─────────────────────────────────────────────────────
  fb: {
    addAccount:          (params: { cookie: string; proxyId?: number | null }) => proxyAction('fb:addAccount', params),
    addAccountWithCredentials: (params: { username: string; password: string; twoFASecret?: string; proxyId?: number | null }) => proxyAction('fb:addAccountWithCredentials', params),
    removeAccount:       (params: { accountId: string }) => proxyAction('fb:removeAccount', params),
    updateCookie:        (params: { accountId: string; cookie: string }) => proxyAction('fb:updateCookie', params),
    refreshProfile:      (params: { accountId: string }) => proxyAction('fb:refreshProfile', params),
    getAccounts:         () => proxyAction('fb:getAccounts'),
    connect:             (params: { accountId: string }) => proxyAction('fb:connect', params),
    disconnect:          (params: { accountId: string }) => proxyAction('fb:disconnect', params),
    checkHealth:         (params: { accountId: string }) => proxyAction('fb:checkHealth', params),
    sendMessage:         (params: any) => proxyAction('fb:sendMessage', params),
    sendAttachment:      (params: any) => proxyAction('fb:sendAttachment', params),
    sendAttachments:     (params: any) => proxyAction('fb:sendAttachments', params),
    unsendMessage:       (params: any) => proxyAction('fb:unsendMessage', params),
    addReaction:         (params: any) => proxyAction('fb:addReaction', params),
    getThreads:          (params: any) => proxyAction('fb:getThreads', params),
    getMessages:         (params: any) => proxyAction('fb:getMessages', params),
    markAsRead:          (params: any) => proxyAction('fb:markAsRead', params),
    changeThreadName:    (params: any) => proxyAction('fb:changeThreadName', params),
    changeThreadEmoji:   (params: any) => proxyAction('fb:changeThreadEmoji', params),
    changeNickname:      (params: any) => proxyAction('fb:changeNickname', params),
    loginWithCredentials:(params: any) => proxyAction('fb:loginWithCredentials', params),
    fetchThreadMessages:   (params: any) => proxyAction('fb:fetchThreadMessages', params),
    refreshContactAvatar:  (params: any) => proxyAction('fb:refreshContactAvatar', params),
    sendTyping:            (params: any) => proxyAction('fb:sendTyping', params),
    blockUser:             (params: any) => proxyAction('fb:blockUser', params),
    unblockUser:           (params: any) => proxyAction('fb:unblockUser', params),
    forwardMessage:        (params: any) => proxyAction('fb:forwardMessage', params),
    editMessage:           (params: any) => proxyAction('fb:editMessage', params),
    createPoll:            (params: any) => proxyAction('fb:createPoll', params),
    getUserInfoFacebookHtml: (params: { accountId: string; userId: string }) => proxyAction('fb:getUserInfoFacebookHtml', params),
    // ─── Scan Data ────────────────────────────────────────────────
    scanGroupMembers:     (params: { accountId: string; groupId: string; cursor?: string | null }) => proxyAction('fb:scanGroupMembers', params),
    scanGroupKeyword:     (params: { accountId: string; keyword: string; cursor?: string | null; filters?: string[]; bsid?: string; tsid?: string }) => proxyAction('fb:scanGroupKeyword', params),
    scanFanpageKeyword:   (params: { accountId: string; keyword: string; cursor?: string | null; filters?: string[]; bsid?: string; tsid?: string }) => proxyAction('fb:scanFanpageKeyword', params),
    scanPostTimeline:     (params: { accountId: string; sourceId: string; sourceType: 'profile' | 'fanpage' | 'group'; cursor?: string | null }) => proxyAction('fb:scanPostTimeline', params),
    scanPostComments:     (params: { accountId: string; postId: string; cursor?: string | null }) => proxyAction('fb:scanPostComments', params),
    scanPostKeyword:      (params: { accountId: string; keyword: string; cursor?: string | null; filters?: string[]; bsid?: string; tsid?: string }) => proxyAction('fb:scanPostKeyword', params),
    // Batch
    scanGroupMembersBatch: (params: { accountId: string; groupIds: string[]; threadCount?: number }) => proxyAction('fb:scanGroupMembersBatch', params),
    scanPostCommentsBatch: (params: { accountId: string; postIds: string[]; threadCount?: number }) => proxyAction('fb:scanPostCommentsBatch', params),
    // Scan history
    saveScanLog:   (params: any) => proxyAction('fb:saveScanLog', params),
    getScanLogs:   (params: { accountId: string; tabId?: string; limit?: number; offset?: number }) => proxyAction('fb:getScanLogs', params),
    // Tab management
    scanSaveTab:       (params: any) => proxyAction('fb:scanSaveTab', params),
    scanGetTabs:       (params: { accountId: string; status?: string; limit?: number; offset?: number }) => proxyAction('fb:scanGetTabs', params),
    scanGetTab:        (params: { id: string }) => proxyAction('fb:scanGetTab', params),
    scanUpdateTabStatus: (params: { id: string; status: string }) => proxyAction('fb:scanUpdateTabStatus', params),
    scanTouchTab:       (params: { id: string }) => proxyAction('fb:scanTouchTab', params),
    scanDeleteTab:     (params: { id: string }) => proxyAction('fb:scanDeleteTab', params),
    scanSaveTabData:   (params: { tabId: string; items: any[]; pageInfo: any }) => proxyAction('fb:scanSaveTabData', params),
    scanGetTabData:    (params: { tabId: string }) => proxyAction('fb:scanGetTabData', params),
    scanSaveRequestLog:(params: any) => proxyAction('fb:scanSaveRequestLog', params),
    scanGetRequestLogs:(params: { tabId: string; limit?: number; offset?: number }) => proxyAction('fb:scanGetRequestLogs', params),
    scanGetStats:      (params: { accountId: string }) => proxyAction('fb:scanGetStats', params),
    scanResetCache:() => proxyAction('fb:scanResetCache'),
  },

  // ─── Telegram Bot ───────────────────────────────────────────────────────
  telegram: {
    validateBot:    (botToken: string) => proxyAction('telegram:validateBot', botToken),
    startBot:       (account: any) => proxyAction('telegram:startBot', account),
    stopBot:        (accountId: string) => proxyAction('telegram:stopBot', accountId),
    isBotPolling:   (params: any) => proxyAction('telegram:isBotPolling', params),
    sendMessage:    (params: any) => proxyAction('telegram:sendMessage', params),
    sendPhoto:      (params: any) => proxyAction('telegram:sendPhoto', params),
    sendVideo:      (params: any) => proxyAction('telegram:sendVideo', params),
    sendDocument:   (params: any) => proxyAction('telegram:sendDocument', params),
    sendAudio:      (params: any) => proxyAction('telegram:sendAudio', params),
    sendSticker:    (params: any) => proxyAction('telegram:sendSticker', params),
    sendVoice:      (params: any) => proxyAction('telegram:sendVoice', params),
    sendAnimation:  (params: any) => proxyAction('telegram:sendAnimation', params),
    sendVideoNote:  (params: any) => proxyAction('telegram:sendVideoNote', params),
    forwardMessage: (params: any) => proxyAction('telegram:forwardMessage', params),
    deleteMessage:  (params: any) => proxyAction('telegram:deleteMessage', params),
    addReaction:    (params: any) => proxyAction('telegram:addReaction', params),
    pinMessage:     (params: any) => proxyAction('telegram:pinMessage', params),
    sendPoll:       (params: any) => proxyAction('telegram:sendPoll', params),
    editMessage:    (params: any) => proxyAction('telegram:editMessage', params),
    getActiveBots:  () => proxyAction('telegram:getActiveBots'),
  },

  // ─── Telegram User (MTProto) ────────────────────────────────────────────
  telegramUser: {
    sendCode:       (phoneNumber: string) => proxyAction('telegramUser:sendCode', phoneNumber),
    signIn:         (params: any) => proxyAction('telegramUser:signIn', params),
    signIn2FA:      (password: string) => proxyAction('telegramUser:signIn2FA', password),
    startListener:  (account: any) => proxyAction('telegramUser:startListener', account),
    stopListener:   (accountId: string) => proxyAction('telegramUser:stopListener', accountId),
    sendMessage:    (params: any) => proxyAction('telegramUser:sendMessage', params),
    editMessage:    (params: any) => proxyAction('telegramUser:editMessage', params),
    deleteMessages: (params: any) => proxyAction('telegramUser:deleteMessages', params),
    forwardMessages:(params: any) => proxyAction('telegramUser:forwardMessages', params),
    pinMessage:     (params: any) => proxyAction('telegramUser:pinMessage', params),
    syncPinnedMessages: (params: any) => proxyAction('telegramUser:syncPinnedMessages', params),
    ensureMessageAvailable: (params: any) => proxyAction('telegramUser:ensureMessageAvailable', params),
    sendFile:       (params: any) => proxyAction('telegramUser:sendFile', params),
    sendTopicFile:  (params: TelegramForumTopicContext & { filePath: string; caption?: string }) => proxyAction('telegramUser:sendTopicFile', params),
    sendTyping:     (params: any) => proxyAction('telegramUser:sendTyping', params),
    sendReaction:   (params: any) => proxyAction('telegramUser:sendReaction', params),
    isConnected:    (accountId: string) => proxyAction('telegramUser:isConnected', accountId),
    getActive:      () => proxyAction('telegramUser:getActive'),
    refreshMessages:(params: { accountId: string }) => proxyAction('telegramUser:refreshMessages', params),
    fetchSelfAvatar:(accountId: string) => proxyAction('telegramUser:fetchSelfAvatar', accountId),
    refreshContactAvatar:(params: { accountId: string; chatId: string }) => proxyAction('telegramUser:refreshContactAvatar', params),
    getBotCommands:(params: { accountId: string; botId: string }) => proxyAction('telegramUser:getBotCommands', params),
    requestWebView:(params: { accountId: string; botId: string; url: string; fromBotMenu?: boolean }) => proxyAction('telegramUser:requestWebView', params),
    requestMainWebView:(params: { accountId: string; botId: string; startParam?: string }) => proxyAction('telegramUser:requestMainWebView', params),
    prolongWebView:(params: { accountId: string; botId: string; queryId: string }) => proxyAction('telegramUser:prolongWebView', params),
    // Group management
    getGroupInfo:      (params: any) => proxyAction('telegramUser:getGroupInfo', params),
    joinGroup:         (params: any) => proxyAction('telegramUser:joinGroup', params),
    getGroupMembers:   (params: any) => proxyAction('telegramUser:getGroupMembers', params),
    hydrateMessageSenders: (params: any) => proxyAction('telegramUser:hydrateMessageSenders', params),
    setDialogMute:     (params: any) => proxyAction('telegramUser:setDialogMute', params),
    setDialogArchived: (params: any) => proxyAction('telegramUser:setDialogArchived', params),
    setDialogPin:      (params: any) => proxyAction('telegramUser:setDialogPin', params),
    getMessageReactions:(params: any) => proxyAction('telegramUser:getMessageReactions', params),
    addChatUser:       (params: any) => proxyAction('telegramUser:addChatUser', params),
    deleteChatUser:    (params: any) => proxyAction('telegramUser:deleteChatUser', params),
    editChatTitle:     (params: any) => proxyAction('telegramUser:editChatTitle', params),
    editChatPhoto:     (params: any) => proxyAction('telegramUser:editChatPhoto', params),
    editChatAdmin:     (params: any) => proxyAction('telegramUser:editChatAdmin', params),
    leaveChat:         (params: any) => proxyAction('telegramUser:leaveChat', params),
    blockUser:         (params: any) => proxyAction('telegramUser:blockUser', params),
    unblockUser:       (params: any) => proxyAction('telegramUser:unblockUser', params),
    exportChatInvite:  (params: any) => proxyAction('telegramUser:exportChatInvite', params),
    readChatHistory:   (params: any) => proxyAction('telegramUser:readChatHistory', params),
    readForumTopic:    (params: any) => proxyAction('telegramUser:readForumTopic', params),
    getMessages:       (params: any) => proxyAction('telegramUser:getMessages', params),
    repairMessageMedia:(params: { accountId: string; chatId: string; messageId: string }) => proxyAction('telegramUser:repairMessageMedia', params),
    repairEmptyMessages:(params: { accountId: string; chatId: string; messageIds: string[] }) => proxyAction('telegramUser:repairEmptyMessages', params),
    repairMessageQuotes:(params: { accountId: string; chatId: string; items: Array<{ messageId: string; replyToId: string }> }) => proxyAction('telegramUser:repairMessageQuotes', params),
    getFullChat:       (params: any) => proxyAction('telegramUser:getFullChat', params),
    getUserProfile:    (params: any) => proxyAction('telegramUser:getUserProfile', params),
    resolveUsername:   (params: any) => proxyAction('telegramUser:resolveUsername', params),
    searchContacts:    (params: any) => proxyAction('telegramUser:searchContacts', params),
    getPeers:          (params: any) => proxyAction('telegramUser:getPeers', params),
    // Forum / Topics
    isForum:              (params: any) => proxyAction('telegramUser:isForum', params),
    checkForumForNewGroups:(params: any) => proxyAction('telegramUser:checkForumForNewGroups', params),
    getForumTopics:       (params: any) => proxyAction('telegramUser:getForumTopics', params),
    getForumTopicMessages:(params: TelegramForumTopicContext & { limit?: number }) => proxyAction('telegramUser:getForumTopicMessages', params),
    createForumTopic:     (params: any) => proxyAction('telegramUser:createForumTopic', params),
    editForumTopic:       (params: TelegramForumTopicContext & { title?: string; iconEmojiId?: string; closed?: boolean; pinned?: boolean }) => proxyAction('telegramUser:editForumTopic', params),
    sendTopicMessage:     (params: TelegramForumTopicContext & { text: string }) => proxyAction('telegramUser:sendTopicMessage', params),
    // Sticker / GIF
    getStickerSets:       (params: any) => proxyAction('telegramUser:getStickerSets', params),
    getStickerSetStickers:(params: any) => proxyAction('telegramUser:getStickerSetStickers', params),
    getRecentStickers:    (params: any) => proxyAction('telegramUser:getRecentStickers', params),
    getGifs:              (params: any) => proxyAction('telegramUser:getGifs', params),
    searchGifs:           (params: any) => proxyAction('telegramUser:searchGifs', params),
    sendSticker:          (params: any) => proxyAction('telegramUser:sendSticker', params),
    sendGif:              (params: any) => proxyAction('telegramUser:sendGif', params),
  },

  // ─── ERP ─────────────────────────────────────────────────────────
  erp: {
    // Projects
    projectList:        (params?: any) => proxyAction('erp:project:list', params),
    projectCreate:      (params: any) => proxyAction('erp:project:create', params),
    projectUpdate:      (params: any) => proxyAction('erp:project:update', params),
    projectDelete:      (params: any) => proxyAction('erp:project:delete', params),
    // Tasks
    taskList:           (params?: any) => proxyAction('erp:task:list', params),
    taskGet:            (params: any) => proxyAction('erp:task:get', params),
    taskCreate:         (params: any) => proxyAction('erp:task:create', params),
    taskUpdate:         (params: any) => proxyAction('erp:task:update', params),
    taskUpdateStatus:   (params: any) => proxyAction('erp:task:updateStatus', params),
    taskAssign:         (params: any) => proxyAction('erp:task:assign', params),
    taskDelete:         (params: any) => proxyAction('erp:task:delete', params),
    taskAddChecklist:   (params: any) => proxyAction('erp:task:addChecklist', params),
    taskToggleChecklist:(params: any) => proxyAction('erp:task:toggleChecklist', params),
    taskAddComment:     (params: any) => proxyAction('erp:task:addComment', params),
    taskEditComment:    (params: any) => proxyAction('erp:task:editComment', params),
    taskDeleteComment:  (params: any) => proxyAction('erp:task:deleteComment', params),
    taskListMyInbox:    (params: any) => proxyAction('erp:task:listMyInbox', params),
    // Calendar
    calendarListEvents: (params: any) => proxyAction('erp:calendar:listEvents', params),
    calendarCreate:     (params: any) => proxyAction('erp:calendar:createEvent', params),
    calendarUpdate:     (params: any) => proxyAction('erp:calendar:updateEvent', params),
    calendarDelete:     (params: any) => proxyAction('erp:calendar:deleteEvent', params),
    calendarCheckConflict:(params: any) => proxyAction('erp:calendar:checkConflict', params),
    // Notes
    noteListFolders:    (params: any) => proxyAction('erp:note:listFolders', params),
    noteCreateFolder:   (params: any) => proxyAction('erp:note:createFolder', params),
    noteRenameFolder:   (params: any) => proxyAction('erp:note:renameFolder', params),
    noteDeleteFolder:   (params: any) => proxyAction('erp:note:deleteFolder', params),
    noteList:           (params?: any) => proxyAction('erp:note:list', params),
    noteGet:            (params: any) => proxyAction('erp:note:get', params),
    noteCreate:         (params: any) => proxyAction('erp:note:create', params),
    noteUpdate:         (params: any) => proxyAction('erp:note:update', params),
    noteDelete:         (params: any) => proxyAction('erp:note:delete', params),
    notePin:            (params: any) => proxyAction('erp:note:pin', params),
    noteListTags:       () => proxyAction('erp:note:listTags'),
    noteCreateTag:      (params: any) => proxyAction('erp:note:createTag', params),
    noteAddTag:         (params: any) => proxyAction('erp:note:addTag', params),
    noteRemoveTag:      (params: any) => proxyAction('erp:note:removeTag', params),
    noteVersions:       (params: any) => proxyAction('erp:note:versions', params),
    noteRestoreVersion: (params: any) => proxyAction('erp:note:restoreVersion', params),
    noteShare:          (params: any) => proxyAction('erp:note:share', params),
    noteListShares:     (params: any) => proxyAction('erp:note:listShares', params),
    // Task watchers/dependencies (Phase 2)
    taskAddWatcher:     (params: any) => proxyAction('erp:task:addWatcher', params),
    taskRemoveWatcher:  (params: any) => proxyAction('erp:task:removeWatcher', params),
    taskAddDependency:  (params: any) => proxyAction('erp:task:addDependency', params),
    taskRemoveDependency:(params: any) => proxyAction('erp:task:removeDependency', params),
    // Calendar respond (Phase 2)
    calendarRespond:    (params: any) => proxyAction('erp:calendar:respond', params),
    // HRM (Phase 2)
    departmentList:     () => proxyAction('erp:department:list'),
    departmentCreate:   (params: any) => proxyAction('erp:department:create', params),
    departmentUpdate:   (params: any) => proxyAction('erp:department:update', params),
    departmentDelete:   (params: any) => proxyAction('erp:department:delete', params),
    positionList:       () => proxyAction('erp:position:list'),
    positionCreate:     (params: any) => proxyAction('erp:position:create', params),
    positionUpdate:     (params: any) => proxyAction('erp:position:update', params),
    positionDelete:     (params: any) => proxyAction('erp:position:delete', params),
    employeeGetProfile: (params: any) => proxyAction('erp:employee:getProfile', params),
    employeeUpdateProfile:(params: any) => proxyAction('erp:employee:updateProfile', params),
    employeeListByDepartment:(params: any) => proxyAction('erp:employee:listByDepartment', params),
    employeeDeleteProfile:(params: any) => proxyAction('erp:employee:deleteProfile', params),
    attendanceCheckIn:  (params: any) => proxyAction('erp:attendance:checkIn', params),
    attendanceCheckOut: (params: any) => proxyAction('erp:attendance:checkOut', params),
    attendanceToday:    () => proxyAction('erp:attendance:today'),
    attendanceList:     (params: any) => proxyAction('erp:attendance:list', params),
    leaveCreate:        (params: any) => proxyAction('erp:leave:create', params),
    leaveListMy:        () => proxyAction('erp:leave:listMy'),
    leaveListPending:   () => proxyAction('erp:leave:listPending'),
    leaveDecide:        (params: any) => proxyAction('erp:leave:decide', params),
    leaveCancel:        (params: any) => proxyAction('erp:leave:cancel', params),
    licenseSeatStatus:  () => proxyAction('erp:license:seatStatus'),
    // Notifications
    notifyListInbox:    (params: any) => proxyAction('erp:notify:listInbox', params),
    notifyMarkRead:     (params: any) => proxyAction('erp:notify:markRead', params),
    notifyMarkAllRead:  (params: any) => proxyAction('erp:notify:markAllRead', params),
    notifyUnreadCount:  (params: any) => proxyAction('erp:notify:unreadCount', params),
    notifyDelete:       (params: any) => proxyAction('erp:notify:delete', params),
    notifyDeleteAll:    (params: any) => proxyAction('erp:notify:deleteAll', params),
  },

  lockScreen: {
    status:           () => proxyAction('lockScreen:status'),
    setup:            (params: { password: string }) => proxyAction('lockScreen:setup', params),
    verify:           (params: { password: string }) => proxyAction('lockScreen:verify', params),
    verifyRecovery:   (params: { recoveryKey: string }) => proxyAction('lockScreen:verifyRecovery', params),
    changePassword:   (params: { oldPassword: string; newPassword: string }) => proxyAction('lockScreen:changePassword', params),
    resetPassword:    (params: { recoveryKey: string; newPassword: string }) => proxyAction('lockScreen:resetPassword', params),
    disable:          (params: { password: string }) => proxyAction('lockScreen:disable', params),
    getRecoveryKey:   (params: { password: string }) => proxyAction('lockScreen:getRecoveryKey', params),
    setBiometric:     (params: { enabled: boolean }) => proxyAction('lockScreen:setBiometric', params),
    biometricUnlock:  () => proxyAction('lockScreen:biometricUnlock'),
  },

  // ─── Media Library ───────────────────────────────────────────────
  library: {
    getItems:    (params: any) => proxyAction('library:getItems', params),
    upload:      (params: any) => proxyAction('library:upload', params),
    deleteItem:  (uuid: string) => proxyAction('library:deleteItem', uuid),
    getFolders:  (params: { zaloId: string; type?: string }) => proxyAction('library:getFolders', params),
    createFolder:(params: any) => proxyAction('library:createFolder', params),
    updateItem:  (uuid: string, params: any) => proxyAction('library:updateItem', { uuid, ...params }),
    renameFolder:(id: number, name: string) => proxyAction('library:renameFolder', { id, name }),
    deleteFolder:(id: number) => proxyAction('library:deleteFolder', id),
  },

  // ─── Push events — mirrored from webEventBus.ts, same contract as preload.ts's on()/removeAllListeners() ──
  on,
  removeAllListeners,

  // ─── Proxy ───────────────────────────────────────────────────────────────
  proxy: {
    list:          ()                              => proxyAction('proxy:list'),
    save:          (proxy: any)                    => proxyAction('proxy:save', { proxy }),
    update:        (id: number, proxy: any)        => proxyAction('proxy:update', { id, proxy }),
    delete:        (id: number)                    => proxyAction('proxy:delete', { id }),
    setAccount:    (zaloId: string, proxyId: number | null) => proxyAction('proxy:setAccount', { zaloId, proxyId }),
    getForAccount: (zaloId: string)                => proxyAction('proxy:getForAccount', { zaloId }),
    test:          (proxy: any)                    => proxyAction('proxy:test', { proxy }),
  },
};
