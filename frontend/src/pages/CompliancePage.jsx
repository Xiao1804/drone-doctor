import React from 'react'
import { Link } from 'react-router-dom'
import {
  COMPLIANCE_EFFECTIVE_DATE,
  PERSONAL_LEARNING_EDITION,
  PERSONAL_LEARNING_EDITION_VERSION
} from '../config/productMode'

const sections = [
  ['scope', '使用范围与责任边界'],
  ['accuracy', 'AI、知识库与 CAAC 内容'],
  ['ai-source', 'AI 服务来源与处理方式'],
  ['safety', '维修与飞行安全'],
  ['data', '账户、记录与分析数据'],
  ['uploads', '图片与飞行日志'],
  ['payment', '免费验证与数据请求'],
  ['changes', '服务变更与试运行说明']
]

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-gray-200 pt-8">
      <h2 className="text-xl font-bold text-gray-950 sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-gray-700 sm:text-base">
        {children}
      </div>
    </section>
  )
}

function CompliancePage() {
  const modeText = PERSONAL_LEARNING_EDITION
    ? `个人学习版已启用（试运行，版本 ${PERSONAL_LEARNING_EDITION_VERSION}）`
    : '个人学习版未启用'

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:border-gray-500 hover:text-black"
        >
          <span aria-hidden="true">←</span>
          返回首页
        </Link>

        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <header className="border-b border-gray-200 px-5 py-7 sm:px-8 sm:py-9">
            <p className="text-sm font-semibold text-[#FF6B00]">DroneDoctor</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              合规与使用说明
            </h1>
            <div className="mt-4 flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:gap-6">
              <p>生效日期：{COMPLIANCE_EFFECTIVE_DATE}</p>
              <p>当前模式：{modeText}</p>
            </div>
          </header>

          <div className="px-5 py-7 sm:px-8 sm:py-9">
            <nav aria-label="本页目录" className="rounded-xl bg-gray-50 p-5">
              <h2 className="font-bold text-gray-950">本页目录</h2>
              <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {sections.map(([id, title], index) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-[#FF6B00]"
                    >
                      {index + 1}. {title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="mt-10 space-y-10">
              <Section id="scope" title="1. 使用范围与责任边界">
                <p>
                  本服务在个人学习版模式下，仅供个人学习、资料查询和无人机故障排查辅助使用。页面提供的判断、步骤和建议不构成专业检验结论，不替代具备相应能力或资质的维修人员进行检查，也不能作为维修资质判断、适航判断或放行飞行的依据。
                </p>
                <p>
                  用户应结合设备制造商手册、官方安全通告、现场状态和专业人员意见独立判断。对无法确认的故障、结构损伤、飞控异常、动力系统异常或其他可能影响安全的情况，应停止操作并寻求专业检查。
                </p>
              </Section>

              <Section id="accuracy" title="2. AI、知识库与 CAAC 内容">
                <p>
                  AI 输出和知识库内容可能存在错误、遗漏、理解偏差或更新不及时，不保证完整、准确或适用于特定机型、固件版本及现场环境。重要操作前应使用可验证的一手资料复核。
                </p>
                <p>
                  本服务中的 CAAC 相关学习内容不是中国民用航空局官方试题，也不是官方题库。题目、答案和解析仅可作为学习辅助；引用来源应当可核验。无法找到可靠依据的内容不应被视为确定结论，请以主管部门公开材料、现行法规和正式考试要求为准。
                </p>
              </Section>

              <Section id="ai-source" title="3. AI 服务来源与处理方式">
                <p>
                  本网站的生成式文本诊断和图像识别能力通过第三方云服务 API 接入，不自行训练或运营面向公众的基础大模型。文字诊断与故障意图理解使用北京深度求索提供的 DeepSeek API；用户主动上传图片时，图片识别使用北京智谱华章提供的 GLM-4.6V-Flash 标准 API。
                </p>
                <p>
                  系统自行开发的部分主要是故障流程编排、规则判断、知识检索和结果展示。本地 bge-small-zh-v1.5 模型仅用于知识向量化与检索，不直接生成对外诊断内容。
                </p>
                <p>
                  用户提交的故障描述、机型、补充上下文及主动上传的图片，可能为完成诊断而发送给当前启用的第三方服务商。请勿提交与故障排查无关的个人敏感信息、商业秘密或无权处理的内容。
                </p>
              </Section>

              <Section id="safety" title="4. 维修与飞行安全">
                <p>
                  涉及拆机、焊接、动力系统、飞控、结构件、电池、螺旋桨、带电检测和试飞的操作具有较高风险。缺少相应知识、工具、隔离措施或现场条件时，请勿自行操作。
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>发现电池鼓包、破损、漏液、异常发热或异味时，应立即停用，避免充放电、挤压、穿刺和接近可燃物，并按当地规则安全处置。</li>
                  <li>检查、安装或更换螺旋桨前，应断电并防止电机意外启动；有裂纹、变形或来源不明的桨叶不得用于飞行。</li>
                  <li>带电检测应由理解电气风险的人员使用合适工具完成，避免短路、触电、起火和部件二次损坏。</li>
                  <li>维修后的地面测试和试飞应设置安全隔离，选择合法、空旷环境，逐级验证，并由具备相应能力和责任权限的人员决定是否放行。</li>
                </ul>
              </Section>

              <Section id="data" title="5. 体验通行证、反馈与分析数据">
                <p>
                  普通体验用户无需注册账号。浏览器本地存储会保存兑换券激活后取得的限时通行证和到期时间，请勿在不受信任或多人共用设备上长期保留。
                </p>
                <p>
                  服务可能处理临时诊断会话和用户反馈，并记录必要的运行与需求验证信息，例如访问页面、截断后的 User-Agent、IP 地址、匿名体验标识、券码发放和激活状态。用户主动填写的微信、电话等联系方式仅用于反馈回访。
                </p>
                <p>
                  这些数据用于实现功能、排查故障、改进知识与诊断效果、统计服务使用情况和防范滥用。分析信息不应被理解为对用户身份或设备状况的专业认证。
                </p>
              </Section>

              <Section id="uploads" title="6. 图片与飞行日志">
                <p>
                  用户上传的图片和 ULog 飞行日志可能先写入服务器临时磁盘。系统会在处理后尝试删除临时文件，但因程序异常、进程中断、备份或基础设施机制，短时间内仍可能存在残留。
                </p>
                <p>
                  图片诊断可能把用户提交的图片及相关提示信息发送给当前部署所配置的第三方多模态模型服务商进行分析，具体接收方取决于部署配置。请勿上传与故障排查无关的个人敏感信息、秘密或无权处理的内容。
                </p>
                <p>
                  当前飞行日志解析在本服务本地完成，不会为了日志解析主动发送给第三方大模型；但服务器托管、网络、监控或备份基础设施仍可能按其运行方式处理相关技术数据。
                </p>
              </Section>

              <Section id="payment" title="7. 免费验证与数据请求">
                <p>
                  当前阶段通过微信免费发放兑换券，不提供在线支付、订阅、自动续费或退款渠道。
                </p>
                <p>
                  普通体验用户没有云端个人历史功能。对于反馈联系方式或其他数据处理、更正、删除需求，可通过页面反馈入口提交说明；处理范围和结果受数据实际存储状态、必要安全留存及基础设施能力限制。
                </p>
              </Section>

              <Section id="changes" title="8. 服务变更与试运行说明">
                <p>
                  试运行期间，功能、模型、知识库、数据字段、保存方式和可用范围可能调整、暂停或终止。本说明会随重要变化更新，继续使用前请关注生效日期和当前部署模式。
                </p>
                <p>
                  本页面用于说明当前个人学习试运行场景，不代表服务已完成任何备案、许可或商业运营合规手续。若转为正式商业运营，应由实际运营主体根据适用法律法规、业务范围和部署地区，完善隐私政策、用户协议、运营主体与联系信息、备案或许可信息，并完成必要的评估与公示。
                </p>
              </Section>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default CompliancePage
