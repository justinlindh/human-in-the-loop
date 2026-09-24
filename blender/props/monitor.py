'''Desk monitor. monitor_screen is a separate UV quad (pal_screen) for canvas textures.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.monitor('m_'), 'monitor')
export()
