// 关键词匹配库 - 用于模糊识别招聘页面的表单字段

const RESUME_KEYWORDS = {
  // 基础信息字段关键词
  basicInfo: {
    name: ['姓名', '名字', '您的姓名', '真实姓名', 'name', 'full name', 'full_name', 'realname'],
    birthDate: ['出生年月', '生日', '出生日期', '年龄', '出生', 'birthday', 'birth', 'date of birth', 'birthdate'],
    phone: ['联系电话', '手机号', '电话', '手机', 'phone', 'mobile', 'tel', '手机号码', '电话号码', '联系方式', 'telephone'],
    email: ['邮箱', '电子邮箱', '邮件', 'email', 'e-mail', 'mail', '电子邮件'],
    address: ['联系地址', '地址', '现居住地', '现住地址', '现居地', 'address', '所在城市', '城市'],
  },

  // 板块级别关键词（用于识别大板块）
  sections: {
    education: [
      '教育经历', '教育背景', '学习经历', '就读经历', '教育情况', '学历信息',
      '学历背景', '教育履历', 'education', 'academic', '院校信息'
    ],
    internship: [
      '实习经历', '实习履历', '实践经历', '实习情况', '实习工作', '工作经历',
      '工作经验', '实习实践', '实习信息', 'internship', 'work experience',
      '实践履历', '实训经历'
    ],
    project: [
      '项目经历', '项目经验', '参与项目', '项目实践', '项目情况', '项目信息',
      '项目履历', 'project', 'project experience', '项目与实践'
    ],
    skills: [
      '技能', '技能证书', '专业技能', '语言能力', '工具技能', '个人技能',
      '技术技能', '技能特长', '能力特长', 'skills', 'skill', '掌握技能',
      '语言与技能', '证书与技能'
    ],
    selfIntro: [
      '个人简介', '自我简介', '个人评价', '自我评价', '个人总结', '自我介绍',
      '个人描述', '自我描述', '其他补充', '补充说明', 'self introduction',
      'personal statement', '关于我', '个人陈述'
    ],
    awards: [
      '获奖经历', '荣誉奖项', '奖项', '获奖情况', '荣誉经历', '竞赛经历',
      '荣誉与奖项', '奖项与荣誉', 'awards', 'honors', '获奖', '荣誉'
    ],
    campus: [
      '校园经历', '在校经历', '学生工作', '学生干部', '社团活动', '校园活动',
      '社团经历', '组织经历', '课外活动', '学生活动', '班级职务',
      'campus experience', 'student work', 'extracurricular'
    ]
  },

  // 子字段关键词（用于板块内精确匹配）
  fields: {
    // 教育经历子字段
    schoolName: ['学校名称', '学校', '就读院校', '毕业院校', '学院', '大学', 'school', 'university', 'college', 'institute'],
    major: ['专业', '所学专业', '专业名称', 'major', 'discipline'],
    eduStartDate: ['入学时间', '就读开始时间', '入学日期', '开始日期', '开始时间', '入学'],
    eduEndDate: ['毕业时间', '就读结束时间', '毕业日期', '预计毕业', '结束日期', '结束时间', '毕业'],
    eduDateRange: ['就读时间', '在读时间', '就读时间段', '时间', '时间段', 'duration'],
    degree: ['学历', '学位', '学历层次', 'degree', 'education level'],
    courses: ['主修课程', '主要课程', '修读课程', '课程', 'courses', 'coursework'],

    // 实习经历子字段
    companyName: ['公司名称', '公司', '单位名称', '单位', '企业名称', '雇主', 'company', 'employer', 'organization'],
    jobTitle: ['岗位名称', '职位', '岗位', '职务', '实习岗位', '工作岗位', 'position', 'title', 'role', 'job title'],
    intStartDate: ['开始时间', '实习开始', '入职时间', '开始日期'],
    intEndDate: ['结束时间', '实习结束', '离职时间', '结束日期'],
    intDateRange: ['实习时间', '在职时间', '工作时间', '时间', '时间段', 'duration'],
    workContent: ['工作内容', '工作描述', '职责描述', '主要工作', '工作职责', '实习内容', 'description', 'responsibilities', 'duties', '工作成果'],

    // 项目经历子字段
    projectName: ['项目名称', 'project name', 'project title'],
    projectRole: ['项目角色', '担任角色', '角色', '职责', '项目中职责', '担任职务', 'role', '我的职责', '本人职责'],
    projStartDate: ['开始日期', '开始时间', '项目开始'],
    projEndDate: ['结束日期', '结束时间', '项目结束'],
    projDateRange: ['项目时间', '时间', '时间段', 'duration'],
    projectDesc: ['项目职责及成果', '项目描述', '项目内容', '工作内容', 'description', '项目详情', '项目成果'],

    // 技能子字段
    toolSkills: ['工具技能', '工具', '软件工具', '专业软件', 'tools', 'software'],
    languageSkills: ['语言能力', '语言', '外语', '英语', 'language', 'languages'],
    certificates: ['其他证书', '证书', '资格证书', 'certificates'],

    // 获奖经历子字段
    awardName: ['奖项名称', '获奖项目', '奖励名称', 'award name', 'award title', 'honor'],
    awardRole: ['担任角色', '参赛角色', '参与角色', 'role'],
    awardDesc: ['奖项描述', '获奖描述', '奖项说明', '奖项内容', '说明', '描述', '详情', 'description'],

    // 校园经历子字段
    campusName: ['经历名称', '活动名称', '组织名称', '社团名称', '任职机构', 'activity name', 'organization'],
    campusRole: ['担任职务', '职务', '职位', '担任职位', '任职职务', 'position', 'title', 'role'],
    campusDesc: ['职务描述', '活动描述', '经历描述', '工作内容', '主要职责', 'description', 'responsibilities'],
  },

  // 招聘页面识别关键词（用于判断是否为招聘页面）
  recruitmentPage: [
    '简历投递', '投递简历', '在线简历', '网申', '简历填写', '填写简历',
    '申请职位', '职位申请', '校招申请', '应聘', '求职申请',
    '个人信息', '基本信息', '工作经历', '教育经历',
    '校园招聘', '社会招聘', '人才招聘', '加入我们', '职位', '岗位',
    'resume', 'application', 'apply', 'career', 'job application',
    '校招', '秋招', '春招', '提交申请', '在线申请'
  ]
};

// 计算两个字符串的相似度（用于模糊匹配）
function calcSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (!s1 || !s2) return 0;  // 任一为空直接返回 0，避免空串包含匹配
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  let matches = 0;
  for (const char of s1) {
    if (s2.includes(char)) matches++;
  }
  return matches / Math.max(s1.length, s2.length);
}

// 模糊匹配标签文本到字段类型
function matchFieldType(labelText) {
  const text = labelText.toLowerCase().trim();
  let bestMatch = null;
  let bestScore = 0;

  // 遍历所有字段关键词
  for (const [fieldName, keywords] of Object.entries(RESUME_KEYWORDS.fields)) {
    for (const keyword of keywords) {
      const score = calcSimilarity(text, keyword.toLowerCase());
      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = fieldName;
      }
    }
  }

  // 也检查基础信息
  for (const [fieldName, keywords] of Object.entries(RESUME_KEYWORDS.basicInfo)) {
    for (const keyword of keywords) {
      const score = calcSimilarity(text, keyword.toLowerCase());
      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = 'basic_' + fieldName;
      }
    }
  }

  return bestMatch;
}

// 匹配板块类型
function matchSectionType(sectionText) {
  const text = sectionText.toLowerCase().trim();
  let bestMatch = null;
  let bestScore = 0;

  for (const [sectionName, keywords] of Object.entries(RESUME_KEYWORDS.sections)) {
    for (const keyword of keywords) {
      const score = calcSimilarity(text, keyword.toLowerCase());
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = sectionName;
      }
    }
  }

  return bestMatch;
}

// 判断页面是否为招聘页面
function isRecruitmentPage() {
  const pageText = document.body ? document.body.innerText.toLowerCase() : '';
  const pageTitle = document.title.toLowerCase();
  const pageUrl = window.location.href.toLowerCase();

  let score = 0;
  for (const keyword of RESUME_KEYWORDS.recruitmentPage) {
    const kw = keyword.toLowerCase();
    if (pageTitle.includes(kw)) score += 3;
    if (pageUrl.includes(kw)) score += 2;
    if (pageText.includes(kw)) score += 1;
  }

  return score >= 5;
}
