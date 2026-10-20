import SwiftUI

// [T-composer-control-sheet] Bottom sheet reached from the container icon in the
// composer (replaces the now-removed "/" button; typing "/" still opens the
// slash menu). Hosts the three per-turn knobs that used to crowd the navigation
// title: model group / model, thinking effort, and context usage.
struct ComposerControlSheet: View {
    @ObservedObject var vm: AIChatViewModel
    @ObservedObject private var configStore = ProviderConfigStore.shared
    @Environment(\.dismiss) private var dismiss

    @State private var showModelPicker = false
    @State private var draggingIndex: Int?

    // MARK: - Derived state

    private var display: SessionModelDisplay {
        SessionModelDisplay(store: configStore, draftGroupId: vm.initialGroupId)
    }

    private var windowTokens: Int {
        if let usage = vm.contextUsage, usage.windowTokens > 0 { return usage.windowTokens }
        return vm.currentModelContextWindow ?? 0
    }

    private var usedTokens: Int {
        if let usage = vm.contextUsage, usage.usedTokens > 0 { return usage.usedTokens }
        return vm.sessionTokenStats.context
    }

    private var fixedTokens: Int { max(vm.contextFixedTokens, 0) }

    private var systemTokens: Int { min(fixedTokens, usedTokens) }

    private var messageTokens: Int { max(usedTokens - systemTokens, 0) }

    private var freeTokens: Int { max(windowTokens - usedTokens, 0) }

    private var fraction: Double {
        guard windowTokens > 0 else { return 0 }
        return min(max(Double(usedTokens) / Double(windowTokens), 0), 1)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    modelCard
                    effortCard
                    contextCard
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)
            .background(ChatColors.background)
            .navigationTitle("模型与上下文")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") { dismiss() }
                        .font(.system(size: 15, weight: .semibold))
                }
            }
            .navigationDestination(isPresented: $showModelPicker) {
                SessionModelPicker(sessionId: vm.sessionId) {
                    await vm.ensureSessionReturningId()
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Model / group

    private var modelCard: some View {
        let modelName = display.displayName(for: vm.sessionId)
        let detail = display.resolvedDetail(for: vm.sessionId)
        let groupBound = display.isGroupBound(for: vm.sessionId)

        return Button {
            showModelPicker = true
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.accentColor.opacity(0.14))
                        .frame(width: 36, height: 36)
                    Image(systemName: "shippingbox.fill")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Color.accentColor)
                }

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(modelName)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(ChatColors.primaryText)
                            .lineLimit(1)
                        if groupBound {
                            Text("分组")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(Color.accentColor)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Capsule().fill(Color.accentColor.opacity(0.14)))
                        }
                    }
                    if let detail {
                        Text("\(detail.providerLabel) · \(detail.modelName)")
                            .font(.system(size: 11))
                            .foregroundStyle(ChatColors.secondaryText)
                            .lineLimit(1)
                    } else {
                        Text("点按选择分组与模型")
                            .font(.system(size: 11))
                            .foregroundStyle(ChatColors.tertiaryText)
                    }
                }

                Spacer(minLength: 8)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(ChatColors.tertiaryText)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(ChatColors.secondaryBg)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Thinking effort (GPT-style slider)

    private var effortCard: some View {
        let levels = vm.availableThinkingLevels
        let current = vm.currentThinkingLevel
        let activeIndex = draggingIndex ?? (levels.firstIndex(of: current) ?? 0)

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("思考强度")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ChatColors.primaryText)
                Spacer(minLength: 4)
                Text(levels.indices.contains(activeIndex) ? levels[activeIndex].displayName : current.displayName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
                    .monospacedDigit()
            }

            if levels.isEmpty {
                Text("当前模型不支持思考强度调节")
                    .font(.system(size: 12))
                    .foregroundStyle(ChatColors.tertiaryText)
            } else {
                effortSlider(levels: levels, activeIndex: activeIndex)
                    .frame(height: 26)

                HStack(spacing: 0) {
                    ForEach(Array(levels.enumerated()), id: \.offset) { index, level in
                        Text(level.displayName)
                            .font(.system(size: 10, weight: index == activeIndex ? .semibold : .regular))
                            .foregroundStyle(index == activeIndex ? Color.accentColor : ChatColors.tertiaryText)
                            .frame(maxWidth: .infinity)
                            .animation(.easeOut(duration: 0.15), value: activeIndex)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(ChatColors.secondaryBg)
        )
    }

    private func effortSlider(levels: [ThinkingLevel], activeIndex: Int) -> some View {
        GeometryReader { geo in
            let width = geo.size.width
            let inset: CGFloat = 10
            let usable = max(width - inset * 2, 1)
            let count = max(levels.count, 1)
            let step = count > 1 ? usable / CGFloat(count - 1) : 0
            let knobX = inset + step * CGFloat(min(activeIndex, count - 1))
            let fillWidth = max(knobX - inset, 5)

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.secondary.opacity(0.18))
                    .frame(width: usable, height: 5)
                    .offset(x: inset)

                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [Color.accentColor.opacity(0.55), Color.accentColor],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: fillWidth, height: 5)
                    .offset(x: inset)

                ForEach(0..<count, id: \.self) { index in
                    Circle()
                        .fill(index <= activeIndex ? Color.white.opacity(0.9) : Color.white.opacity(0.001))
                        .frame(width: 3, height: 3)
                        .offset(x: inset + step * CGFloat(index) - 1.5)
                }

                Circle()
                    .fill(Color(UIColor.systemBackground))
                    .frame(width: 20, height: 20)
                    .overlay(Circle().stroke(Color.accentColor, lineWidth: 2.5))
                    .shadow(color: Color.black.opacity(0.18), radius: 3, x: 0, y: 1)
                    .offset(x: knobX - 10)
                    .animation(.easeOut(duration: 0.12), value: activeIndex)
            }
            .frame(width: width, height: 26)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        draggingIndex = levelIndex(at: value.location.x, inset: inset, step: step, count: count)
                    }
                    .onEnded { value in
                        let index = levelIndex(at: value.location.x, inset: inset, step: step, count: count)
                        draggingIndex = nil
                        if levels.indices.contains(index), levels[index] != vm.currentThinkingLevel {
                            vm.setThinkingLevel(levels[index])
                        }
                    }
            )
        }
    }

    private func levelIndex(at x: CGFloat, inset: CGFloat, step: CGFloat, count: Int) -> Int {
        guard count > 1, step > 0 else { return 0 }
        let raw = (x - inset) / step
        return min(max(Int(raw.rounded()), 0), count - 1)
    }

    // MARK: - Context usage (Doubao-style breakdown)

    private var contextCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("上下文使用")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ChatColors.primaryText)
                Spacer(minLength: 4)
                Text(windowTokens > 0 ? String(format: "%.1f%%", fraction * 100) : "—")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(fraction >= 0.8 ? Color.red : Color.accentColor)
                    .monospacedDigit()
            }

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(Self.compactTokens(usedTokens))
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(ChatColors.primaryText)
                    .monospacedDigit()
                Text("/ \(Self.compactTokens(windowTokens))")
                    .font(.system(size: 13))
                    .foregroundStyle(ChatColors.secondaryText)
                    .monospacedDigit()
                Spacer(minLength: 0)
            }

            stackedBar

            VStack(spacing: 7) {
                legendRow(title: "系统提示词与工具", tokens: systemTokens, color: Color.accentColor.opacity(0.45))
                legendRow(title: "对话消息", tokens: messageTokens, color: Color.accentColor)
                legendRow(title: "剩余可用", tokens: freeTokens, color: Color.secondary.opacity(0.28))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(ChatColors.secondaryBg)
        )
    }

    private var stackedBar: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let sysFraction = windowTokens > 0 ? min(CGFloat(systemTokens) / CGFloat(windowTokens), 1) : 0
            let msgFraction = windowTokens > 0
                ? min(CGFloat(messageTokens) / CGFloat(windowTokens), max(1 - sysFraction, 0))
                : 0

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.secondary.opacity(0.14))

                HStack(spacing: 1.5) {
                    if sysFraction > 0 {
                        Capsule()
                            .fill(Color.accentColor.opacity(0.45))
                            .frame(width: max(width * sysFraction - 1, 2))
                    }
                    if msgFraction > 0 {
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [Color.accentColor.opacity(0.75), Color.accentColor],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(width * msgFraction - 1, 2))
                    }
                }
            }
        }
        .frame(height: 7)
    }

    private func legendRow(title: String, tokens: Int, color: Color) -> some View {
        let share = windowTokens > 0 ? Double(tokens) / Double(windowTokens) * 100 : 0
        return HStack(spacing: 7) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(title)
                .font(.system(size: 12))
                .foregroundStyle(ChatColors.secondaryText)
            Spacer(minLength: 6)
            Text(String(format: "%.1f%%", share))
                .font(.system(size: 11))
                .foregroundStyle(ChatColors.tertiaryText)
                .monospacedDigit()
            Text(Self.compactTokens(tokens))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(ChatColors.primaryText)
                .monospacedDigit()
                .frame(minWidth: 54, alignment: .trailing)
        }
    }

    // MARK: - Helpers

    /// Doubao-style compact numbers: `58.2K` / `256.0K` / `1.0M`.
    static func compactTokens(_ value: Int) -> String {
        let v = Double(max(value, 0))
        if v >= 1_000_000 { return String(format: "%.1fM", v / 1_000_000) }
        if v >= 1_000 { return String(format: "%.1fK", v / 1_000) }
        return String(format: "%.0f", v)
    }
}
