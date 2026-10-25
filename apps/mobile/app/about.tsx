// 关于页（从「我的」进入）：产品定位 / 核心能力 / 数据说明 / 项目主页 / 版本
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { C, useSettings } from '../components/ui';
import { Icon, LogoMark, type IconName } from '../components/icons';

const PROJECT_URL = 'https://github.com/boooozhang2007/PathPilot';

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'target', title: '岗位洞察', desc: '基于真实招聘平台样本（猎聘 / 应届生等）分析目标岗位的技能要求与出现频次' },
  { icon: 'layers', title: '能力档案', desc: '技能分专业/通用两类管理，等级 + 证据链接（代码 / 项目 / 证书），能力是否掌握由证据说话' },
  { icon: 'chat', title: 'AI 顾问', desc: '对话式助手，可查数据、调规划、管任务，操作真实生效' },
  { icon: 'roadmap', title: '成长路线', desc: '按学期生成可执行规划，随进度与目标变化动态调整、版本可回溯' },
  { icon: 'checkCircle', title: '任务中心', desc: '分学期任务打卡，完成后提交证据，逐步攒出可写进简历的经历' },
];

export default function About() {
  const router = useRouter();
  const { fs } = useSettings();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ padding: 16, paddingTop: 54, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>关于</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 13, color: C.accent, fontWeight: '700' }}>完成</Text>
        </TouchableOpacity>
      </View>

      {/* 品牌卡 */}
      <View style={{ backgroundColor: C.deep, borderRadius: 16, padding: 22, alignItems: 'center', marginBottom: 14 }}>
        <View style={{ marginBottom: 12 }}>
          <LogoMark size={56} bg={C.accent} fg="#FFFFFF" />
        </View>
        <Text style={{ color: C.white, fontSize: 19, fontWeight: '800' }}>PathPilot AI</Text>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 4 }}>AI 职业成长规划与能力管理平台</Text>
        <View style={{ marginTop: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' }}>v{version}</Text>
        </View>
      </View>

      {/* 产品定位 */}
      <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 6 }}>我们做什么</Text>
        <Text style={{ fontSize: 13, color: C.slate, lineHeight: 21 }}>
          PathPilot 面向计算机专业大学生，把「岗位要求 → 能力差距 → 学期规划 → 任务证据」连成闭环：岗位结论来自真实招聘样本，能力提升落到可验证的证据与可执行的任务，而不是空泛的建议。
        </Text>
      </View>

      {/* 核心能力 */}
      <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 10 }}>核心能力</Text>
        {FEATURES.map((f) => (
          <View key={f.title} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line + '60' }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={f.icon} size={15} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{f.title}</Text>
              <Text style={{ fontSize: 11.5, color: C.slate, lineHeight: 18, marginTop: 2 }}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* 数据与隐私 */}
      <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 6 }}>数据说明</Text>
        <Text style={{ fontSize: 12, color: C.slate, lineHeight: 19 }}>
          · 岗位样本均采集自公开招聘平台并保留原始来源链接；{'\n'}· 匹配度是基于样本的辅助参考指标，不构成就业概率或承诺；{'\n'}· 个人档案、规划与任务数据保存在你配置的服务器上，删除账号即删除全部数据。
        </Text>
      </View>

      {/* 项目主页：真实仓库地址 */}
      <TouchableOpacity
        style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}
        onPress={() => Linking.openURL(PROJECT_URL).catch(() => {})}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Icon name="star" size={16} color={C.amber} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.ink }}>项目主页</Text>
            <Text style={{ fontSize: fs(11), color: C.slate2, marginTop: 2 }} numberOfLines={1}>boooozhang2007/PathPilot</Text>
          </View>
        </View>
        <Icon name="chevronRight" size={16} color={C.slate2} />
      </TouchableOpacity>

      <Text style={{ fontSize: 11, color: C.slate2, textAlign: 'center', lineHeight: 17 }}>
        © 2026 PathPilot · 毕业设计演示用途{'\n'}AI 生成内容请自行核实关键信息
      </Text>
    </ScrollView>
  );
}
