import SwiftUI

struct ContentView: View {
    @State private var model = RemoteModel()
    @State private var confirmOff = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    tvSection
                    timerSection
                    resultSection
                }
                .padding()
            }
            .navigationTitle("V/TV Remote")
            .disabled(model.busy)
        }
        .onAppear { model.load() }
        .confirmationDialog("Turn the TV off now?", isPresented: $confirmOff, titleVisibility: .visible) {
            Button("Turn Off Now", role: .destructive) { model.turnOffNow() }
            Button("Keep On", role: .cancel) {}
        }
    }

    private var tvSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("TV").font(.headline)
            TextField("TV IP address, e.g. 192.168.1.20", text: $model.host)
                .keyboardType(.numbersAndPunctuation)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
            HStack {
                Button("Pair") { model.pair() }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.host.trimmingCharacters(in: .whitespaces).isEmpty)
                Label(model.status, systemImage: model.isPaired ? "checkmark.circle.fill" : "exclamationmark.circle")
                    .foregroundStyle(model.isPaired ? Color.green : Color.secondary)
                    .font(.subheadline)
            }
        }
    }

    private var timerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sleep timer").font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 90))], spacing: 12) {
                ForEach(RemoteModel.presets, id: \.self) { m in
                    Button("\(m) min") { model.setTimer(m) }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                }
            }
            Stepper(value: $model.customMinutes, in: 1...720, step: 5) {
                Text("Custom: \(model.customMinutes) min")
            }
            Button("Set \(model.customMinutes) min") { model.setTimer(model.customMinutes) }
                .buttonStyle(.borderedProminent)
            HStack {
                Button("Cancel timer") { model.cancelTimer() }
                    .buttonStyle(.bordered)
                Button("Off now", role: .destructive) { confirmOff = true }
                    .buttonStyle(.bordered)
            }
            Text("The phone briefly takes over the TV screen while sending (about 10 seconds). YouTube reopens paused.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .disabled(!model.isPaired)
    }

    private var resultSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Last result").font(.headline)
            HStack(alignment: .top) {
                if model.busy { ProgressView() }
                Text(model.lastResult)
            }
        }
    }
}
