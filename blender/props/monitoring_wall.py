'''Agent monitoring wall: big display on posts over a low console. wall_screen is a UV quad (pal_screen); wall_led_0..2 are status LEDs.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.monitor_wall('mw_'), 'monitoring_wall')
export()
