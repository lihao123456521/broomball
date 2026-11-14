// Rebuild the active female English WAV commentary with installed Samantha.
// Usage: swift tools/build-commentary.swift <catalog.json> assets/voice/commentary
import Foundation
import AVFoundation

struct Line: Codable { let id: String; let text: String; let emphasis: [String] }
let args = CommandLine.arguments
if args.count != 3 { fatalError("Expected catalog JSON and output directory") }
let lines = try JSONDecoder().decode([Line].self, from: Data(contentsOf:URL(fileURLWithPath:args[1])))
let output = URL(fileURLWithPath:args[2], isDirectory:true)
try FileManager.default.createDirectory(at:output, withIntermediateDirectories:true)
let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("broomball-commentary-"+UUID().uuidString, isDirectory:true)
try FileManager.default.createDirectory(at:temporary, withIntermediateDirectories:true)
defer {try? FileManager.default.removeItem(at:temporary)}
func escape(_ value:String)->String {value.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;").replacingOccurrences(of:">",with:"&gt;")}
let synth = AVSpeechSynthesizer()
guard let voice=AVSpeechSynthesisVoice.speechVoices().first(where:{$0.name=="Samantha"&&$0.language=="en-US"}) else {
 fatalError("Install the Samantha en-US female voice before rebuilding. No default or male fallback is used.")
}
var metadata:[[String:Any]]=[]
for (index,line) in lines.enumerated() {
 var words = escape(line.text)
 for name in line.emphasis.sorted(by:{$0.count>$1.count}) {
  words=words.replacingOccurrences(of:escape(name),with:"<prosody rate=\"88%\" pitch=\"+1st\" volume=\"+2dB\"><emphasis level=\"strong\">"+escape(name)+"</emphasis></prosody>")
 }
 let ssml="<speak version=\"1.0\" xml:lang=\"en-US\"><prosody rate=\"105%\" pitch=\"-1st\" volume=\"-1dB\">"+words+"</prosody></speak>"
 guard let utterance=AVSpeechUtterance(ssmlRepresentation:ssml) else {fatalError("Invalid SSML for "+line.id)}
 utterance.voice=voice
 let wav=temporary.appendingPathComponent(line.id+".wav")
 var file:AVAudioFile?,done=false,failed:Error?
 synth.write(utterance){ buffer in
  guard let pcm=buffer as? AVAudioPCMBuffer else{return}
  if pcm.frameLength==0 {done=true;return}
  do {
   if file==nil {file=try AVAudioFile(forWriting:wav,settings:pcm.format.settings)}
   try file!.write(from:pcm)
  } catch {failed=error;done=true}
 }
 let deadline=Date(timeIntervalSinceNow:30)
 while !done&&Date()<deadline {RunLoop.current.run(until:Date(timeIntervalSinceNow:0.02))}
 if let error=failed {throw error}
 guard done,file != nil,file!.length>0 else {fatalError("Empty/timed out recording: "+line.id)}
 let duration=Double(file!.length)/file!.fileFormat.sampleRate
 guard duration>0.4&&duration<10 else {fatalError("Unexpected duration for "+line.id)}
 file=nil // Finalize the WAV header before the converter reads it.
 let destination=output.appendingPathComponent(line.id+".wav")
 try? FileManager.default.removeItem(at:destination)
 let convert=Process();convert.executableURL=URL(fileURLWithPath:"/usr/bin/afconvert")
 convert.arguments=["-f","WAVE","-d","LEI16@22050","-c","1",wav.path,destination.path]
 try convert.run();convert.waitUntilExit()
 guard convert.terminationStatus==0 else {fatalError("Conversion failed: "+line.id)}
 let rendered=try AVAudioFile(forReading:destination)
 guard rendered.fileFormat.sampleRate==22050,rendered.fileFormat.channelCount==1 else {fatalError("Unexpected WAV format: "+line.id)}
 guard let pcm=AVAudioPCMBuffer(pcmFormat:rendered.processingFormat,frameCapacity:AVAudioFrameCount(rendered.length)) else {fatalError("WAV decode failed: "+line.id)}
 try rendered.read(into:pcm)
 var peak:Double=0,squareSum:Double=0
 if let samples=pcm.floatChannelData?[0] {
  for i in 0..<Int(pcm.frameLength) {let value=Double(samples[i])*32768;peak=max(peak,abs(value));squareSum+=value*value}
 }
 let rms=sqrt(squareSum/max(1,Double(pcm.frameLength)))
 guard peak>1000,rms>50 else {fatalError("Silent female commentary: "+line.id)}
 let bytes=(try FileManager.default.attributesOfItem(atPath:destination.path)[.size] as! NSNumber).intValue
 guard bytes>4000 else {fatalError("Empty compressed clip: "+line.id)}
 metadata.append(["id":line.id,"text":line.text,"emphasis":line.emphasis,"ssml":ssml,"voice":voice.name,"gender":"female","language":"en-US","duration":duration,"bytes":bytes,"file":destination.lastPathComponent,"sampleRate":22050,"peak":peak,"rms":rms])
 if (index+1)%10==0||index==lines.count-1 {print("Rendered \(index+1)/\(lines.count)")}
}
let json=try JSONSerialization.data(withJSONObject:metadata,options:[.prettyPrinted,.sortedKeys])
try json.write(to:output.appendingPathComponent("manifest.json"))
print("Saved \(lines.count) continuous female English WAV clips, with name and house emphasis.")
