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
    @State private var dragOffsetRatio: CGFloat? = nil

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
            .background(LiquidAmbientBackdrop())
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
            .modifier(LiquidCardSurface())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Thinking effort (ChatGPT-style plump capsule slider)

    private var effortCard: some View {
        let levels = vm.availableThinkingLevels
        let current = vm.currentThinkingLevel
        let activeIndex = draggingIndex ?? (levels.firstIndex(of: current) ?? 0)

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("思考强度")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ChatColors.primaryText)
                Spacer(minLength: 4)
                Text(levels.indices.contains(activeIndex) ? levels[activeIndex].displayName : current.displayName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
                    .monospacedDigit()
            }

            if levels.isEmpty {
                Text("当前模型不支持思考强度调节")
                    .font(.system(size: 12))
                    .foregroundStyle(ChatColors.tertiaryText)
            } else {
                chatGPTCapsuleSlider(levels: levels, activeIndex: activeIndex)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(LiquidCardSurface())
    }

    /// Pixel-perfect ChatGPT plump capsule slider reproduction
    private func chatGPTCapsuleSlider(levels: [ThinkingLevel], activeIndex: Int) -> some View {
        GeometryReader { geo in
            let outerHeight: CGFloat = 54
            let outerRadius: CGFloat = outerHeight / 2 // 27pt
            let blueHeight: CGFloat = 48
            let blueRadius: CGFloat = blueHeight / 2 // 24pt
            let knobDiameter: CGFloat = 42
            let knobRadius: CGFloat = knobDiameter / 2 // 21pt
            let dotDiameter: CGFloat = 8

            let totalWidth = geo.size.width
            let dotStart = outerRadius
            let dotEnd = max(totalWidth - outerRadius, dotStart)
            let count = max(levels.count, 1)
            let step = count > 1 ? (dotEnd - dotStart) / CGFloat(count - 1) : 0

            // Current animated/dragged position
            let currentFloatIndex: CGFloat = {
                if let ratio = dragOffsetRatio {
                    return max(0, min(CGFloat(count - 1), ratio))
                }
                return CGFloat(min(activeIndex, count - 1))
            }()

            let knobCenterX = dotStart + step * currentFloatIndex
            let blueWidth = max((knobCenterX - dotStart) + blueRadius * 2, blueHeight)

            ZStack(alignment: .leading) {
                // 1. Outer capsule container
                Capsule()
                    .fill(Color(UIColor.tertiarySystemFill))
                    .frame(width: totalWidth, height: outerHeight)

                // 2. Active bright blue capsule track (from first dot to current knob position)
                Capsule()
                    .fill(Color(red: 0.18, green: 0.48, blue: 0.96))
                    .frame(width: blueWidth, height: blueHeight)
                    .offset(x: dotStart - blueRadius)

                // 3. Scale dots
                ForEach(0..<count, id: \.self) { idx in
                    let dotX = dotStart + step * CGFloat(idx)
                    Circle()
                        .fill(
                            CGFloat(idx) < currentFloatIndex
                                ? Color.white.opacity(0.55)
                                : Color.white.opacity(0.28)
                        )
                        .frame(width: dotDiameter, height: dotDiameter)
                        .position(x: dotX, y: outerRadius)
                }

                // 4. White plump knob
                Circle()
                    .fill(Color.white)
                    .frame(width: knobDiameter, height: knobDiameter)
                    .shadow(color: Color.black.opacity(0.18), radius: 4, x: 0, y: 2)
                    .position(x: knobCenterX, y: outerRadius)
            }
            .frame(width: totalWidth, height: outerHeight)
            .contentShape(Capsule())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let locationX = value.location.x
                        let rawIndex = (locationX - dotStart) / (step > 0 ? step : 1)
                        let clamped = max(0, min(CGFloat(count - 1), rawIndex))
                        dragOffsetRatio = clamped

                        let nearestIndex = min(max(Int(clamped.rounded()), 0), count - 1)
                        if draggingIndex != nearestIndex {
                            draggingIndex = nearestIndex
                            UISelectionFeedbackGenerator().selectionChanged()
                        }
                    }
                    .onEnded { value in
                        let locationX = value.location.x
                        let rawIndex = (locationX - dotStart) / (step > 0 ? step : 1)
                        let targetIndex = min(max(Int(rawIndex.rounded()), 0), count - 1)

                        withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
                            dragOffsetRatio = nil
                            draggingIndex = nil
                        }

                        if levels.indices.contains(targetIndex) {
                            let newLevel = levels[targetIndex]
                            if newLevel != vm.currentThinkingLevel {
                                UISelectionFeedbackGenerator().selectionChanged()
                                vm.setThinkingLevel(newLevel)
                            }
                        }
                    }
            )
            .animation(.spring(response: 0.28, dampingFraction: 0.82), value: activeIndex)
        }
        .frame(height: 54)
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
                legendRow(
                    color: Color.accentColor,
                    label: "系统与设定",
                    tokens: systemTokens
                )
                legendRow(
                    color: Color.teal,
                    label: "消息内容",
                    tokens: messageTokens
                )
                legendRow(
                    color: ChatColors.tertiaryText.opacity(0.35),
                    label: "剩余空间",
                    tokens: freeTokens
                )
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(LiquidCardSurface())
    }

    private var stackedBar: some View {
        GeometryReader { geo in
            let totalW = geo.size.width
            let usableTokens = max(windowTokens, 1)

            let sysW = totalW * CGFloat(systemTokens) / CGFloat(usableTokens)
            let msgW = totalW * CGFloat(messageTokens) / CGFloat(usableTokens)

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.secondary.opacity(0.18))
                    .frame(width: totalW, height: 10)

                HStack(spacing: 0) {
                    if sysW > 0 {
                        Rectangle()
                            .fill(Color.accentColor)
                            .frame(width: max(sysW, 2), height: 10)
                    }
                    if msgW > 0 {
                        Rectangle()
                            .fill(Color.teal)
                            .frame(width: max(msgW, 2), height: 10)
                    }
                }
                .clipShape(Capsule())
            }
        }
        .frame(height: 10)
    }

    private func legendRow(color: Color, label: String, tokens: Int) -> some View {
        HStack(spacing: 8) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(ChatColors.secondaryText)
            Spacer(minLength: 4)
            Text(Self.compactTokens(tokens))
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(ChatColors.primaryText)
                .monospacedDigit()
        }
    }

    // MARK: - Formatters

    private static func compactTokens(_ count: Int) -> String {
        if count <= 0 { return "0" }
        if count >= 1_000_000 {
            let m = Double(count) / 1_000_000.0
            return String(format: "%.1fM", m)
        }
        if count >= 1_000 {
            let k = Double(count) / 1_000.0
            return String(format: "%.1fk", k)
        }
        return "\(count)"
    }
}

// MARK: - Liquid Glass Card Surface

private struct LiquidCardSurface: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
    }

    func body(content: Content) -> some View {
        content
            .background {
                ZStack {
                    shape.fill(.ultraThinMaterial)

                    shape.fill(
                        LinearGradient(
                            colors: colorScheme == .dark
                                ? [Color.white.opacity(0.06), Color.white.opacity(0.01)]
                                : [Color.white.opacity(0.65), Color.white.opacity(0.35)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                    shape.strokeBorder(
                        LinearGradient(
                            stops: [
                                .init(color: colorScheme == .dark ? Color.white.opacity(0.38) : Color.white.opacity(0.90), location: 0.0),
                                .init(color: colorScheme == .dark ? Color.white.opacity(0.10) : Color.white.opacity(0.25), location: 0.4),
                                .init(color: colorScheme == .dark ? Color.white.opacity(0.02) : Color.white.opacity(0.06), location: 1.0)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        lineWidth: 0.65
                    )
                }
                .shadow(
                    color: colorScheme == .dark ? Color.black.opacity(0.25) : Color.black.opacity(0.05),
                    radius: 8,
                    x: 0,
                    y: 2
                )
            }
            .clipShape(shape)
    }
}

