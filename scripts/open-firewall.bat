@echo off
rem PathPilot 手机端连电脑：放行后端 3000 与 Web 3001 端口入站
netsh advfirewall firewall add rule name="PathPilot API 3000" dir=in action=allow protocol=TCP localport=3000 profile=any
netsh advfirewall firewall add rule name="PathPilot Web 3001" dir=in action=allow protocol=TCP localport=3001 profile=any
echo DONE
