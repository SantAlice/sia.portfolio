#!/usr/bin/perl
# Локальный статический сервер для просмотра сайта.
# Запуск из корня проекта:   perl serve.pl 8110
# Затем открыть:             http://127.0.0.1:8110/index.html
#
# Зачем он нужен: видео требует HTTP Range-запросов (иначе не работает
# перемотка), а по file:// относительные пути и backdrop-filter ведут себя
# иначе, чем на реальном хостинге.
use strict; use warnings; use IO::Socket::INET;

my $PORT = shift @ARGV || 8110;
my $ROOT = shift @ARGV || '.';
my $srv = IO::Socket::INET->new(
  LocalAddr => '127.0.0.1', LocalPort => $PORT,
  Listen => 64, Reuse => 1, Proto => 'tcp'
) or die "Не удалось занять порт $PORT: $!\n";

$SIG{PIPE} = 'IGNORE';   # клиент рвёт соединение на середине видео — не падать
$| = 1;
print "Сайт: http://127.0.0.1:$PORT/index.html\n";
print "Остановить: Ctrl+C\n";

my %MIME = (
  html => 'text/html; charset=utf-8',  css  => 'text/css; charset=utf-8',
  js   => 'application/javascript; charset=utf-8',
  mp4  => 'video/mp4',   webp => 'image/webp',  png  => 'image/png',
  jpg  => 'image/jpeg',  jpeg => 'image/jpeg',  svg  => 'image/svg+xml',
  woff2=> 'font/woff2',  woff => 'font/woff',   ttf  => 'font/ttf',
  json => 'application/json', ico => 'image/x-icon', md => 'text/plain; charset=utf-8',
);

sub urldec { my $s = shift; $s =~ s/%([0-9a-fA-F]{2})/chr(hex($1))/ge; $s }

while (my $c = $srv->accept) {
  eval {
    $c->autoflush(1);
    my $req = '';
    while ($req !~ /\r\n\r\n/) {
      my $b; my $n = sysread($c, $b, 4096); last unless $n; $req .= $b;
    }
    my ($method, $path) = $req =~ m{^(\w+)\s+(\S+)};

    # ── Приём готовых файлов от служебной страницы _tools/prep.html ──
    # Только localhost, только внутрь public/img/cases/ и public/video/cases/.
    # Нужно потому, что на машине нет ни ffmpeg, ни ImageMagick: сжатие
    # делает браузер через canvas, а сюда кладёт результат.
    if (defined $method && $method eq 'PUT') {
      my ($clen) = $req =~ /Content-Length:\s*(\d+)/i;
      my ($body) = $req =~ /\r\n\r\n(.*)$/s;
      $body = '' unless defined $body;
      while (defined $clen && length($body) < $clen) {
        my $b; my $n = sysread($c, $b, 65536); last unless $n; $body .= $b;
      }
      my $rel = $path; $rel =~ s{^/}{}; $rel =~ s{\.\.}{}g; $rel = urldec($rel);
      unless ($rel =~ m{^public/(img|video)/(cases/)?[^/]+$}) {
        print $c "HTTP/1.1 403 Forbidden\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        close $c; next;
      }
      my $dest = "$ROOT/$rel"; my $dir = $dest; $dir =~ s{/[^/]+$}{};
      mkdir $dir unless -d $dir;
      open my $out, '>', $dest or do {
        print $c "HTTP/1.1 500 Internal Server Error\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        close $c; next;
      };
      binmode $out; print $out $body; close $out;
      my $n = -s $dest;
      print $c "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: text/plain\r\nContent-Length: ".length("ok $n")."\r\nConnection: close\r\n\r\nok $n";
      close $c; next;
    }
    if (defined $method && $method eq 'OPTIONS') {
      print $c "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, PUT, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
      close $c; next;
    }

    $path = '/index.html' if !defined $path || $path eq '/';
    ($path) = split /\?/, $path;
    $path = urldec($path);
    $path =~ s{\.\.}{}g;                      # не выпускать за пределы корня
    my $file = $ROOT . $path;

    unless (-f $file) {
      print $c "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
      close $c; next;
    }

    my ($ext) = $file =~ /\.([A-Za-z0-9]+)$/;
    my $mime = $MIME{lc($ext || '')} || 'application/octet-stream';
    my $size = -s $file;
    open my $fh, '<', $file or die $!;
    binmode $fh;

    my ($start, $end, $partial) = (0, $size - 1, 0);
    if ($req =~ /Range:\s*bytes=(\d*)-(\d*)/i) {
      $partial = 1;
      $start = $1 ne '' ? $1 + 0 : 0;
      $end   = $2 ne '' ? $2 + 0 : $size - 1;
      $end   = $size - 1 if $end > $size - 1;
    }
    my $len = $end - $start + 1;

    my $hdr = $partial
      ? "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes $start-$end/$size\r\n"
      : "HTTP/1.1 200 OK\r\n";
    $hdr .= "Access-Control-Allow-Origin: *\r\n";   # чтобы canvas не считал файл чужим
    $hdr .= "Content-Type: $mime\r\nContent-Length: $len\r\n"
          . "Accept-Ranges: bytes\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
    print $c $hdr;

    if (($method || '') ne 'HEAD') {
      seek $fh, $start, 0;
      my $left = $len;
      while ($left > 0) {
        my $chunk = $left > 65536 ? 65536 : $left;
        my $buf; my $r = read($fh, $buf, $chunk);
        last unless $r;
        print $c $buf; $left -= $r;
      }
    }
    close $fh;
  };
  close $c;
}
