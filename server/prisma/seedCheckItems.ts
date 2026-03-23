import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 模拟用户场景：为不同类型的硬件活动添加检查项
 * 涵盖 EVT/DVT/PVT/MP 各阶段的典型检查项
 */

// 活动名称关键字 → 对应的检查项列表
const CHECK_ITEMS_MAP: Record<string, Array<{ title: string; checked: boolean }>> = {
  // ========== 硬件开发相关 ==========
  'PCBA 验证调试': [
    { title: '电源纹波测试 ≤ 50mV', checked: true },
    { title: 'IO 电平逻辑验证', checked: true },
    { title: '时钟频率测量', checked: false },
    { title: '功耗测试（待机/工作模式）', checked: false },
    { title: '温升测试（关键器件 < 85°C）', checked: false },
    { title: 'ESD 防护验证', checked: false },
  ],
  'PCB layout': [
    { title: 'DRC 检查通过', checked: true },
    { title: '关键信号阻抗匹配', checked: true },
    { title: '电源平面完整性检查', checked: true },
    { title: '散热过孔布局', checked: false },
    { title: '天线净空区域检查', checked: false },
    { title: '生产工艺可制造性评审', checked: false },
  ],
  '原理图': [
    { title: '电源电路设计复核', checked: true },
    { title: '去耦电容布局', checked: true },
    { title: '接口 ESD/TVS 保护', checked: false },
    { title: '信号完整性分析', checked: false },
    { title: 'BOM 器件可采购性确认', checked: false },
  ],
  '降本': [
    { title: '替代物料清单汇总', checked: true },
    { title: '成本对比分析表', checked: false },
    { title: '替代物料样品验证', checked: false },
    { title: '可靠性对比测试', checked: false },
    { title: '量产供应链确认', checked: false },
  ],

  // ========== 软件开发相关 ==========
  '固件发布': [
    { title: '版本号更新', checked: true },
    { title: '功能测试全部通过', checked: true },
    { title: '回归测试通过', checked: false },
    { title: 'OTA 升级验证', checked: false },
    { title: '降级兼容性测试', checked: false },
    { title: '发布文档更新', checked: false },
  ],
  '联调': [
    { title: '通信协议一致性验证', checked: true },
    { title: '串口/SPI/I2C 通信稳定性', checked: false },
    { title: '异常断电恢复测试', checked: false },
    { title: '固件升级流程验证', checked: false },
    { title: 'LED 状态指示确认', checked: false },
  ],

  // ========== 测试验证相关 ==========
  '整机测试': [
    { title: '基本功能测试', checked: true },
    { title: 'WiFi 性能测试（吞吐量/覆盖范围）', checked: true },
    { title: '高低温循环测试', checked: false },
    { title: '跌落测试', checked: false },
    { title: '老化测试（72h）', checked: false },
    { title: '安规预测试', checked: false },
    { title: '包装跌落测试', checked: false },
  ],
  '互通性测试': [
    { title: 'Android 设备配对测试', checked: true },
    { title: 'iOS 设备配对测试', checked: true },
    { title: 'Windows 兼容性测试', checked: false },
    { title: 'macOS 兼容性测试', checked: false },
    { title: '第三方平台联动测试', checked: false },
  ],
  'EVT 阶段测试': [
    { title: '功能验证测试报告', checked: false },
    { title: '射频性能测试', checked: false },
    { title: 'EMC 预测试', checked: false },
    { title: '功耗基线数据采集', checked: false },
  ],

  // ========== 认证相关 ==========
  '认证': [
    { title: 'FCC 认证送样', checked: false },
    { title: 'CE 认证送样', checked: false },
    { title: 'SRRC 认证送样', checked: false },
    { title: 'CCC 认证（如适用）', checked: false },
    { title: '认证样品准备（5pcs）', checked: false },
    { title: '认证报告归档', checked: false },
  ],

  // ========== 包材/结构相关 ==========
  '包材': [
    { title: '包装设计稿确认', checked: true },
    { title: '彩盒打样确认', checked: false },
    { title: '说明书内容校审', checked: false },
    { title: '条码/SN 标签确认', checked: false },
    { title: '包装跌落测试', checked: false },
  ],
  '模具': [
    { title: '3D 图纸评审', checked: true },
    { title: '模具 T1 样品尺寸检验', checked: false },
    { title: '外观面品质确认', checked: false },
    { title: '装配验证', checked: false },
    { title: '卡扣强度测试', checked: false },
  ],

  // ========== 商务/量产相关 ==========
  'BOM': [
    { title: 'BOM 清单核对', checked: true },
    { title: '长交期物料确认', checked: true },
    { title: '替代料标注', checked: false },
    { title: '成本核算完成', checked: false },
  ],
  '试产': [
    { title: 'SMT 首件确认', checked: false },
    { title: '组装工艺确认', checked: false },
    { title: '测试治具就绪', checked: false },
    { title: '产线良率 > 95%', checked: false },
    { title: '不良品分析报告', checked: false },
  ],
  '评审': [
    { title: '评审材料准备', checked: true },
    { title: '问题项清单整理', checked: false },
    { title: '各部门评审意见收集', checked: false },
    { title: '评审结论记录', checked: false },
    { title: '遗留问题跟踪表', checked: false },
  ],
};

async function main() {
  console.log('开始为活动添加检查项种子数据...');

  // 获取所有活动
  const activities = await prisma.activity.findMany({
    select: { id: true, name: true },
  });

  let totalCreated = 0;
  let activitiesMatched = 0;

  for (const activity of activities) {
    // 匹配活动名称中的关键字
    for (const [keyword, checkItems] of Object.entries(CHECK_ITEMS_MAP)) {
      if (activity.name.includes(keyword)) {
        // 检查是否已经有检查项
        const existing = await prisma.checkItem.count({ where: { activityId: activity.id } });
        if (existing > 0) continue;

        // 批量创建检查项
        for (let i = 0; i < checkItems.length; i++) {
          await prisma.checkItem.create({
            data: {
              activityId: activity.id,
              title: checkItems[i].title,
              checked: checkItems[i].checked,
              sortOrder: i,
            },
          });
        }

        totalCreated += checkItems.length;
        activitiesMatched++;
        console.log(`  ✓ ${activity.name}: 添加 ${checkItems.length} 项检查项`);
        break; // 每个活动只匹配第一个关键字
      }
    }
  }

  console.log(`\n完成！匹配 ${activitiesMatched} 个活动，共创建 ${totalCreated} 个检查项`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
