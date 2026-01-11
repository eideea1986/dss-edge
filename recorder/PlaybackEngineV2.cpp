#include <iostream>
#include <vector>
#include <string>
#include <sqlite3.h>
#include <filesystem>
#include <cstdio>
#include <cstdlib>
#include <atomic>
#include <csignal>

extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/opt.h>
#include <libavfilter/avfilter.h>
#include <libavfilter/buffersink.h>
#include <libavfilter/buffersrc.h>
}

struct Segment {
    int id;
    std::string file;
    int64_t start_ts;
    int64_t end_ts;
};

sqlite3* db;
std::atomic<bool> running(true);

void signalHandler(int sig) {
    std::cout << "\n[Playback] Stopping gracefully...\n";
    running = false;
}

/* ================= OPEN INDEX ================= */
void openIndex(const std::string& path) {
    if (sqlite3_open(path.c_str(), &db)) {
        std::cerr << "Cannot open index DB: " << path << "\n";
        exit(1);
    }
}

/* ================= QUERY SEGMENTS ================= */
std::vector<Segment> getSegments(int64_t from, int64_t to) {
    std::vector<Segment> list;
    
    const char* sql =
        "SELECT id, file, start_ts, end_ts "
        "FROM segments "
        "WHERE end_ts >= ? AND start_ts <= ? "
        "ORDER BY id";
    
    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        std::cerr << "SQL Prepare error: " << sqlite3_errmsg(db) << "\n";
        return list;
    }
    
    sqlite3_bind_int64(stmt, 1, from);
    sqlite3_bind_int64(stmt, 2, to);
    
    while (sqlite3_step(stmt) == SQLITE_ROW) {
        Segment s;
        s.id = sqlite3_column_int(stmt, 0);
        s.file = (const char*)sqlite3_column_text(stmt, 1);
        s.start_ts = sqlite3_column_int64(stmt, 2);
        s.end_ts = sqlite3_column_int64(stmt, 3);
        list.push_back(s);
    }
    
    sqlite3_finalize(stmt);
    return list;
}

/* ================= BUILD CONCAT FILE ================= */
std::string buildConcat(const std::vector<Segment>& segs, const std::string& base) {
    std::string concat = "/tmp/playback_concat.txt";
    FILE* f = fopen(concat.c_str(), "w");
    if (!f) return "";
    
    for (auto& s : segs) {
        std::string path = base + "/segments/" + s.file;
        if (std::filesystem::exists(path)) {
            fprintf(f, "file '%s'\n", path.c_str());
        } else {
            std::cerr << "Missing segment file: " << path << "\n";
        }
    }
    
    fclose(f);
    return concat;
}

/* ================= STREAM TO RTSP ================= */
void streamRTSP(
    const std::string& concatFile,
    const std::string& rtspUrl,
    double speed
) {
    char cmd[2048];
    
    // Stream to RTSP using FFmpeg (re-encode if needed for speed control)
    // For speed=1.0, we can use -c copy for efficiency
    // For speed != 1.0, we need to re-encode with setpts filter
    
    std::string videoCodec = (speed == 1.0) ? "-c:v copy" : "-c:v libx264 -preset ultrafast";
    std::string audioCodec = "-an"; // No audio for now
    std::string speedFilter = (speed == 1.0) ? "" : "-vf setpts=PTS/" + std::to_string(speed);
    
    snprintf(cmd, sizeof(cmd),
        "ffmpeg -re -fflags +genpts "
        "-f concat -safe 0 -i %s "
        "%s "  // Speed filter
        "%s %s "  // Video/Audio codec
        "-f rtsp -rtsp_transport tcp %s "
        "2>&1",
        concatFile.c_str(),
        speedFilter.c_str(),
        videoCodec.c_str(),
        audioCodec.c_str(),
        rtspUrl.c_str()
    );
    
    std::cout << "[Playback] Starting RTSP stream: " << rtspUrl << "\n";
    std::cout << "[Exec] " << cmd << "\n";
    
    // Run FFmpeg and monitor
    FILE* pipe = popen(cmd, "r");
    if (!pipe) {
        std::cerr << "[Error] Failed to start FFmpeg\n";
        return;
    }
    
    char buffer[256];
    while (running && fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        // Print FFmpeg output for debugging
        std::cout << buffer;
    }
    
    int status = pclose(pipe);
    std::cout << "[Playback] FFmpeg exit code: " << WEXITSTATUS(status) << "\n";
}

/* ================= MAIN ================= */
int main(int argc, char** argv) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    if (argc < 6) {
        std::cout << "Usage: ./playback_engine <camera_id> <archive_path> <start_ts> <end_ts> <rtsp_port> [speed]\n";
        std::cout << "Example: ./playback_engine cam_001 /opt/dss-edge/storage/cam_001 1000 5000 8555 1.0\n";
        return 1;
    }
    
    std::string camId = argv[1];
    std::string archive = argv[2];
    int64_t start = std::stoll(argv[3]);
    int64_t end = std::stoll(argv[4]);
    int rtspPort = std::stoi(argv[5]);
    double speed = (argc >= 7) ? std::stod(argv[6]) : 1.0;
    
    std::string rtspUrl = "rtsp://127.0.0.1:" + std::to_string(rtspPort) + "/" + camId + "_playback";
    
    openIndex(archive + "/index.db");
    
    std::cout << "=== DSS Playback Engine V2.0 ===\n";
    std::cout << "Camera: " << camId << "\n";
    std::cout << "Archive: " << archive << "\n";
    std::cout << "Range: " << start << " -> " << end << "\n";
    std::cout << "Speed: " << speed << "x\n";
    std::cout << "RTSP: " << rtspUrl << "\n";
    
    auto segs = getSegments(start, end);
    
    if (segs.empty()) {
        std::cout << "[Playback] No video segments found in interval [" << start << ", " << end << "]\n";
        
        // Debug: Show total segments
        const char* sql = "SELECT COUNT(*) FROM segments";
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr);
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            std::cout << "[Debug] Total segments in DB: " << sqlite3_column_int(stmt, 0) << "\n";
        }
        sqlite3_finalize(stmt);
        
        sqlite3_close(db);
        return 1;
    }
    
    std::cout << "[Playback] Found " << segs.size() << " segments for playback.\n";
    
    std::string concat = buildConcat(segs, archive);
    if (concat.empty()) {
        std::cerr << "[Error] Failed to create concat file\n";
        sqlite3_close(db);
        return 1;
    }
    
    // Stream to RTSP
    streamRTSP(concat, rtspUrl, speed);
    
    sqlite3_close(db);
    return 0;
}
