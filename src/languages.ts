export type Language = 'id' | 'zh';

export interface TranslationDict {
  // General App
  appName: string;
  appSubtitle: string;
  loginBtn: string;
  logoutBtn: string;
  adminTag: string;
  operator: string;
  operationTime: string;
  operationLocation: string;
  provinceStr: string;
  cityStr: string;
  districtStr: string;
  descStr: string;
  mediaStr: string;
  submitUpload: string;
  searchBtn: string;
  searchPlaceholder: string;
  searchRange: string;
  allStr: string;
  surveyStr: string;
  lineStr: string;
  installStr: string;
  copySuccessAlert: string;
  copyRecordBtn: string;
  previewMediaTip: string;
  editBtn: string;
  deleteBtn: string;
  cancelBtn: string;
  saveBtn: string;

  // Dashboard Tabs
  tabDashboard: string;
  tabDataManage: string;
  tabSurveyData: string;
  tabLineData: string;
  tabInstallData: string;
  tabMapView: string;
  tabSearchCenter: string;
  tabUploadChannel: string;
  tabUploadSurvey: string;
  tabUploadLine: string;
  tabUploadInstall: string;
  tabAccountManage: string;
  tabAdminAccount: string;
  tabSurveyorAccount: string;

  // Stats
  statTotalData: string;
  statSurveyData: string;
  statLineData: string;
  statInstallData: string;
  latestRecords: string;
  pointPreview: string;

  // Form fields or placeholders
  selectOperatorPlh: string;
  selectTimePlh: string;
  selectProvincePlh: string;
  selectCityPlh: string;
  selectDistrictPlh: string;
  dragFilePlh: string;
  dragFileTip: string;
  descPlh: string;

  // Type-specific form fields
  longDistanceLines: string;
  localLines: string;
  installedLines: string;
  totalDurationHours: string;
  longDistancePhones: string;
  localPhones: string;

  // Account settings
  newAdminBtn: string;
  newSurveyorBtn: string;
  namePlh: string;
  emailPlh: string;
  phonePlh: string;
  adminListHeader: string;
  surveyorListHeader: string;

  // Feedback alerts
  uploadSuccess: string;
  deleteSuccess: string;
  saveSuccess: string;
  confirmDelete: string;
  noRecordsFound: string;
  noRecordsDesc: string;
  adminEmptyMsg: string;
  surveyorEmptyMsg: string;

  // New added
  addAdminSuccess: string;
  deleteAdminConfirm: string;
  deleteAdminSuccess: string;
  detailCloseBtn: string;
  filterPlaceholder: string;
  filterLabel: string;
  filterAll: string;

  // Extra auth details
  bannerTitle: string;
  bannerDesc: string;
  loginRequiredDesc: string;
  loggedInAs: string;
  notAdminWarningTitle: string;
  notAdminWarningDesc: string;
  loginGoogleBtn: string;
  usernamePlh: string;
  passwordPlh: string;
  orLoginWithGoogle: string;
  seedConfirm: string;
  seedSuccess: string;
  dbSeedTitle: string;
  dbSeedDesc: string;
  dbSeedBtn: string;
  zoomIn: string;
  zoomOut: string;
  resetMap: string;
  showDetails: string;
}

const zhTranslation: TranslationDict = {
    appName: 'LXVOIP DATABASE',
    appSubtitle: 'Lx集团数据中心系统',
    loginBtn: '登录系统',
    logoutBtn: '退出登录',
    adminTag: '官方管理员',
    operator: '操作人',
    operationTime: '操作时间',
    operationLocation: '操作地点',
    provinceStr: '省份',
    cityStr: '城市',
    districtStr: '区县',
    descStr: '文本描述',
    mediaStr: '图片视频资料',
    submitUpload: '提交上传',
    searchBtn: '搜索',
    searchPlaceholder: '输入关键词搜索...',
    searchRange: '搜索范围',
    allStr: '全部',
    surveyStr: '踩点数据',
    lineStr: '测线数据',
    installStr: '安装数据',
    copySuccessAlert: '整条记录的内容已成功复制到剪巾板！',
    copyRecordBtn: '复制整条记录',
    previewMediaTip: ' 点击直接预览 {images} 张图片 + {videos} 个视频',
    editBtn: '编辑',
    deleteBtn: '删除',
    cancelBtn: '取消',
    saveBtn: '保存修改',

    // Dashboard Tabs
    tabDashboard: '控制台首页',
    tabDataManage: '资料综合管理',
    tabSurveyData: '踩点数据',
    tabLineData: '测线数据',
    tabInstallData: '安装数据',
    tabMapView: '可视化点位分布图',
    tabSearchCenter: '数据检索中心',
    tabUploadChannel: '数据上传通道',
    tabUploadSurvey: '踩点数据上传',
    tabUploadLine: '测线数据上传',
    tabUploadInstall: '安装记录上传',
    tabAccountManage: '账户管理',
    tabAdminAccount: '管理员账户管理',
    tabSurveyorAccount: '踩点员账户管理',

    // Stats
    statTotalData: '总数据量',
    statSurveyData: '踩点数据',
    statLineData: '测线数据',
    statInstallData: '安装数据',
    latestRecords: '最新上传记录',
    pointPreview: '点位分布预览',

    // Form fields
    selectOperatorPlh: '请选择或输入操作人名称...',
    selectTimePlh: '请选择操作时间...',
    selectProvincePlh: '请选择省份',
    selectCityPlh: '请选择城市',
    selectDistrictPlh: '请选择区县',
    dragFilePlh: '点击或拖拽文件到此处上传',
    dragFileTip: '支持上传图片、视频。最多可上传 10 个文件。',
    descPlh: '请输入详细描述内容，支持文本折行...',

    // Type field labels
    longDistanceLines: '长途线路数量 (根)',
    localLines: '本地线路数量 (根)',
    installedLines: '安装线路 (根)',
    totalDurationHours: '总时长 (小时)',
    longDistancePhones: '长途电话数量 (个)',
    localPhones: '本地电话数量 (个)',

    // Accounts
    newAdminBtn: '添加管理员账户',
    newSurveyorBtn: '添加踩点员账户',
    namePlh: '输入人员真实姓名...',
    emailPlh: '输入谷歌邮箱账户...',
    phonePlh: '输入联系密码/电话号码...',
    adminListHeader: '官方系统管理员列表',
    surveyorListHeader: '注册的踩点员列表',

    // Feedback Alert notifications
    uploadSuccess: '数据成功同步并提交到云端服务器！',
    deleteSuccess: '数据已在云端完全移除！',
    saveSuccess: '修改内容已成功保存！',
    confirmDelete: '您确定要彻底删除该记录 "{name}" 吗？',
    noRecordsFound: '未找到相关的数据记录',
    noRecordsDesc: '当前的搜索词或地区筛选器在此部分中无匹配。',
    adminEmptyMsg: '未注册额外的副管理员账户。',
    surveyorEmptyMsg: '暂无注册的踩点员名录信息。',

    // New added
    addAdminSuccess: '新管理员账号已注册并获得授权！',
    deleteAdminConfirm: '您确定要解除该管理员 "{name}" 的权限吗？',
    deleteAdminSuccess: '管理员已自系统安全组除名。',
    detailCloseBtn: '关闭窗口',
    filterPlaceholder: '输入关键词筛选记录...',
    filterLabel: '筛选类型',
    filterAll: '全部类型',

    // Extra details
    bannerTitle: 'LXVOIP DATABASE',
    bannerDesc: '欢迎登录LX集团数据管理终端。快速检索和录入多维地区勘探踩点、电信干线组网测量及工程落地交付记录。',
    loginRequiredDesc: '请输入合法的管理员标识或登入超级邮箱账号。',
    loggedInAs: '登录身份: {email}',
    notAdminWarningTitle: '管理员访问受限',
    notAdminWarningDesc: '系统已成功授权第三方账号，但在系统中无法检查到相关的安全组条目。',
    loginGoogleBtn: '使用内置谷歌连接',
    usernamePlh: '请输入账号名或邮箱...',
    passwordPlh: '请输入账号密码...',
    orLoginWithGoogle: '或一键授权谷歌登录',
    seedConfirm: '确定要初始化产生踩点、测线、安装的示例大楼记录进行演示吗？',
    seedSuccess: '云数据库初始化成功，演练模板已经填充就绪！',
    dbSeedTitle: '数据恢复与初始化',
    dbSeedDesc: '如果首次部署提示无数据，点击此按钮可将标准踩点测线安装案例录入。',
    dbSeedBtn: '恢复演示数据集',
    zoomIn: '放大地图',
    zoomOut: '缩小地图',
    resetMap: '恢复初始大小',
    showDetails: '查看详情内容'
};

export const translations: Record<Language, TranslationDict> = {
  zh: zhTranslation,
  id: zhTranslation,
};
