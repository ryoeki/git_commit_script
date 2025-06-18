const { execSync } = require('child_process');
const fs = require('fs');

// 配置工作时间：周一到周五的9:00-18:00
const WORK_HOURS = {
  start: 9,
  end: 18
};

const WORK_DAYS = [1, 2, 3, 4, 5]; // 周一到周五

/**
 * 判断是否为工作时间
 * @param {Date} date 
 * @returns {boolean}
 */
function isWorkTime(date) {
  const dayOfWeek = date.getDay(); // 0=周日, 1=周一, ..., 6=周六
  const hour = date.getHours();
  
  // 检查是否为工作日
  if (!WORK_DAYS.includes(dayOfWeek)) {
    return false;
  }
  
  // 检查是否在工作时间内
  if (hour < WORK_HOURS.start || hour >= WORK_HOURS.end) {
    return false;
  }
  
  return true;
}

/**
 * 获取git提交记录
 * @param {number} limit 限制获取的提交数量，默认1000
 * @returns {Array} 提交记录数组
 */
function getGitCommits(limit = 1000) {
  try {
    console.log('🔍 正在检查git仓库...');
    
    // 首先检查是否是git仓库
    try {
      execSync('git rev-parse --git-dir', { encoding: 'utf8', stdio: 'pipe' });
      console.log('✅ 确认当前目录是git仓库');
    } catch (error) {
      throw new Error('当前目录不是git仓库');
    }
    
    console.log(`📥 正在获取最近 ${limit} 条提交记录...`);
    
    // 限制提交数量以提高性能
    const gitLog = execSync(`git log --max-count=${limit} --pretty=format:"%H|%ai|%s"`, { 
      encoding: 'utf8',
      timeout: 30000, // 30秒超时
      stdio: 'pipe'
    });
    
    if (!gitLog.trim()) {
      console.log('⚠️ 没有找到提交记录');
      return [];
    }
    
    console.log('✅ 提交记录获取成功，正在解析...');
    
    const lines = gitLog.trim().split('\n');
    console.log(`📊 共获取到 ${lines.length} 条原始记录`);
    
    const commits = [];
    for (let i = 0; i < lines.length; i++) {
      if (i % 200 === 0 && i > 0) {
        console.log(`   解析进度: ${i}/${lines.length} (${Math.round(i/lines.length*100)}%)`);
      }
      
      const line = lines[i];
      const parts = line.split('|');
      
      if (parts.length < 2) {
        console.warn(`⚠️ 跳过格式异常的提交记录: ${line.substring(0, 50)}...`);
        continue;
      }
      
      const [hash, dateStr, ...messageParts] = parts;
      const message = messageParts.join('|'); // 重新组合消息部分
      
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          console.warn(`⚠️ 跳过日期格式异常的记录: ${dateStr}`);
          continue;
        }
        
        commits.push({
          hash: hash,
          date: date,
          message: message || '',
          dateStr: dateStr
        });
      } catch (err) {
        console.warn(`⚠️ 解析提交记录失败: ${line.substring(0, 50)}...`);
      }
    }
    
    console.log(`✅ 成功解析 ${commits.length} 条有效提交记录\n`);
    return commits;
    
  } catch (error) {
    console.error('❌ 获取git提交记录失败:', error.message);
    return [];
  }
}

/**
 * 分析提交记录
 */
function analyzeCommits(limit = 1000) {
  console.log('📈 开始分析git提交记录...\n');
  
  const commits = getGitCommits(limit);
  
  if (commits.length === 0) {
    console.log('❌ 没有提交记录可分析');
    return;
  }
  
  console.log(`📊 开始分析 ${commits.length} 条提交记录...\n`);
  
  let nonWorkTimeCommits = [];
  let nonWorkTimeDates = new Set();
  let processedCount = 0;
  
  for (const commit of commits) {
    processedCount++;
    if (processedCount % 100 === 0) {
      console.log(`   分析进度: ${processedCount}/${commits.length} (${Math.round(processedCount/commits.length*100)}%)`);
    }
    
    if (!isWorkTime(commit.date)) {
      nonWorkTimeCommits.push(commit);
      // 只保存日期部分，用于统计天数
      const dateOnly = commit.date.toISOString().split('T')[0];
      nonWorkTimeDates.add(dateOnly);
    }
  }
  
  // 生成统计报告
  console.log('\n=== 非工作时间提交统计 ===');
  console.log(`📝 非工作时间提交次数: ${nonWorkTimeCommits.length}`);
  console.log(`📅 非工作时间提交天数: ${nonWorkTimeDates.size}`);
  console.log(`✅ 工作时间提交次数: ${commits.length - nonWorkTimeCommits.length}`);
  console.log(`📊 非工作时间提交占比: ${((nonWorkTimeCommits.length / commits.length) * 100).toFixed(2)}%\n`);
  
  if (nonWorkTimeCommits.length > 0) {
    console.log('=== 最近10次非工作时间提交 ===');
    
    // 显示最近的10次非工作时间提交
    const recentNonWorkCommits = nonWorkTimeCommits.slice(0, 10);
    recentNonWorkCommits.forEach((commit, index) => {
      const timeStr = commit.date.toLocaleTimeString('zh-CN', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      const dateStr = commit.date.toLocaleDateString('zh-CN');
      const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][commit.date.getDay()];
      
      console.log(`${(index + 1).toString().padStart(2, ' ')}. ${dateStr} ${timeStr} (${dayOfWeek})`);
      console.log(`    ${commit.message.substring(0, 80)}${commit.message.length > 80 ? '...' : ''}\n`);
    });
    
    if (nonWorkTimeCommits.length > 10) {
      console.log(`... 还有 ${nonWorkTimeCommits.length - 10} 条非工作时间提交记录\n`);
    }
    
    // 生成详细JSON报告
    console.log('📄 正在生成详细报告...');
    const reportData = {
      统计时间: new Date().toLocaleString('zh-CN'),
      分析范围: `最近${commits.length}条提交`,
      总提交次数: commits.length,
      非工作时间提交次数: nonWorkTimeCommits.length,
      非工作时间提交天数: nonWorkTimeDates.size,
      非工作时间提交占比: `${((nonWorkTimeCommits.length / commits.length) * 100).toFixed(2)}%`,
      工作时间配置: `工作日 ${WORK_HOURS.start}:00-${WORK_HOURS.end}:00`,
      非工作时间提交详情: nonWorkTimeCommits.map(commit => ({
        提交哈希: commit.hash.substring(0, 8),
        提交时间: commit.date.toLocaleString('zh-CN'),
        星期: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][commit.date.getDay()],
        提交信息: commit.message
      }))
    };
    
    try {
      fs.writeFileSync('commit-analysis-report.json', JSON.stringify(reportData, null, 2), 'utf8');
      console.log('✅ 详细报告已保存到: commit-analysis-report.json');
    } catch (error) {
      console.error('❌ 保存报告失败:', error.message);
    }
  }
  
  console.log('\n=== 时间分布统计 ===');
  
  // 按小时统计（只显示有提交的小时）
  const hourlyStats = Array(24).fill(0);
  commits.forEach(commit => {
    hourlyStats[commit.date.getHours()]++;
  });
  
  console.log('各小时提交分布:');
  hourlyStats.forEach((count, hour) => {
    if (count > 0) {
      const isWorkHour = hour >= WORK_HOURS.start && hour < WORK_HOURS.end;
      const indicator = isWorkHour ? '🟢' : '🔴';
      const percentage = ((count / commits.length) * 100).toFixed(1);
      console.log(`  ${indicator} ${hour.toString().padStart(2, '0')}:00 - ${count.toString().padStart(3)} 次 (${percentage}%)`);
    }
  });
  
  // 按星期统计
  const weeklyStats = Array(7).fill(0);
  commits.forEach(commit => {
    weeklyStats[commit.date.getDay()]++;
  });
  
  console.log('\n各星期提交分布:');
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  weeklyStats.forEach((count, day) => {
    if (count > 0) {
      const isWorkDay = WORK_DAYS.includes(day);
      const indicator = isWorkDay ? '🟢' : '🔴';
      const percentage = ((count / commits.length) * 100).toFixed(1);
      console.log(`  ${indicator} ${weekDays[day]} - ${count.toString().padStart(3)} 次 (${percentage}%)`);
    }
  });
  
  console.log('\n✅ 分析完成！');
}

// 主程序
function main() {
  console.log('📈 Git提交时间分析工具');
  console.log('⚙️ 工作时间定义: 周一至周五 9:00-18:00');
  console.log('📝 默认分析最近1000条提交记录\n');
  
  try {
    // 可以通过命令行参数指定分析的提交数量
    const limit = process.argv[2] ? parseInt(process.argv[2]) : 1000;
    if (limit > 0) {
      analyzeCommits(limit);
    } else {
      console.error('❌ 提交数量必须大于0');
    }
  } catch (error) {
    console.error('❌ 分析过程中出现错误:', error.message);
  }
}

// 如果直接运行此文件，则执行主程序
if (require.main === module) {
  main();
}

module.exports = {
  analyzeCommits,
  isWorkTime,
  getGitCommits
}; 