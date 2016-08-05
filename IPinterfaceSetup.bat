@echo off
set /p numKiosk=Number of kiosks?: 
set /p adapter=Network adapter(e.g. "Local Area Connection"): 
set /p subnet=IP subnet address(first three octets): 
set /p gateway=Gateway address(full address): 
set /p startAddress=Starting address(last octet): 
set /a endAddress=%startAddress%+%numKiosk%-1
FOR /L %%A IN (%startAddress%,1,%endAddress%) DO netsh interface ip add address name="Local Area Connection" addr=%subnet%.%%A mask=255.255.255.0 gateway=%gateway% gwmetric=0
netsh interface ip add dns name=%adapter% addr=10.1.1.73 index=1
netsh interface ip add dns name=%adapter% addr=10.10.128.215 index=2
pause
