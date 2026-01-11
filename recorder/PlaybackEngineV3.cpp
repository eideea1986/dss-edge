#include <iostream>
#include <vector>
#include <string>
#include <sqlite3.h>
#include <filesystem>
#include <cstdio>
#include <cstdlib>
#include <atomic>
#include <csignal>
#include <unistd.h>

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

void openIndex(const std::string& path) {
    if (sqlite3_open(path.c_str(), &db)) {
        std::cerr << "Cannot open index DB: " << path << "\n";
        exit(1);
    }
}

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

std::string buildConcat(const std::vector<Segment>& segs, const std::string& base) {
    std::string concat = "/tmp/playback_concat_" + std::to_string(getpid()) + ".txt";
    FILE* f = fopen(concat.c_str(), "w");
    if (!f) return "";
    
    for (auto& s : segs) {
        std::string path = base + "/segments/" + s.file;
        if (std::filesystem::exists(path)) {
            fprintf(f, "file '%s'\n", path.c_str());
        }
    }
    
    fclose(f);
    return concat;
}

void streamRTSP(const std::string& concatFile, const std::string& rtspUrl, double speed) {
    char cmd[2048];
    
    // Use -re for realtime and setpts for speed control
    std::string speedFilter = (speed == 1.0) ? "" : ("-vf setpts=PTS/" + std::to_string(speed));
    
    snprintf(cmd, sizeof(cmd),
        "ffmpeg -re -fflags +genpts -f concat -safe 0 -i %s %s -c:v copy -an -f rtsp -rtsp_transport tcp %s 2>&1",
        concatFile.c_str(),
        speedFilter.c_str(),
        rtspUrl.c_str()
    );
    
    std::cout << "[Playback] Streaming to " << rtspUrl << "\n";
    std::cout << "[Exec] " << cmd << "\n";
    
    FILE* pipe = popen(cmd, "r");
    if (!pipe) {
        std::cerr << "[Error] Failed to start FFmpeg\n";
        return;
    }
    
    char buffer[256];
    while (running && fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        std::cout << buffer;
    }
    
    int status = pclose(pipe);
    std::cout << "[Playback] FFmpeg exit code: " << WEXITSTATUS(status) << "\n";
}

int main(int argc, char** argv) {
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    if (argc < 6) {
        std::cout << "Usage: ./playback_engine <camera_id> <archive_path> <start_ts> <end_ts> <rtsp_port> [speed]\n";
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
    
    std::cout << "=== DSS Playback Engine V3.0 ===\n";
    std::cout << "Camera: " << camId << "\n";
    std::cout << "Archive: " << archive << "\n";
    std::cout << "Range: " << start << " -> " << end << "\n";
    std::cout << "Speed: " << speed << "x\n";
    
    auto segs = getSegments(start, end);
    
    if (segs.empty()) {
        std::cout << "[Playback] No segments found\n";
        sqlite3_close(db);
        return 1;
    }
    
    std::cout << "[Playback] Found " << segs.size() << " segments\n";
    
    std::string concat = buildConcat(segs, archive);
    if (concat.empty()) {
        std::cerr << "[Error] Failed to create concat file\n";
        sqlite3_close(db);
        return 1;
    }
    
    streamRTSP(concat, rtspUrl, speed);
    
    // Cleanup
    unlink(concat.c_str());
    sqlite3_close(db);
    return 0;
}
